"""Detect and perspective-correct a photographed ID card with OpenCV.

The input is supplied by the Node API through a temporary file.  This program
never stores the source or result: it writes one JSON response to stdout.
"""
import base64
import json
import sys

import cv2
import numpy as np


def ordered(points):
    points = np.asarray(points, dtype=np.float32).reshape(4, 2)
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).reshape(-1)
    return np.array([
        points[np.argmin(sums)], points[np.argmin(diffs)],
        points[np.argmax(sums)], points[np.argmax(diffs)]
    ], dtype=np.float32)


def four_corners(contour):
    perimeter = cv2.arcLength(contour, True)
    for factor in (0.018, 0.025, 0.035, 0.05):
        polygon = cv2.approxPolyDP(contour, factor * perimeter, True)
        if len(polygon) == 4 and cv2.isContourConvex(polygon):
            return polygon.reshape(4, 2)
    return None


def detect(image):
    source_h, source_w = image.shape[:2]
    scale = min(1.0, 1800.0 / max(source_h, source_w))
    working = cv2.resize(image, (round(source_w * scale), round(source_h * scale))) if scale < 1 else image
    height, width = working.shape[:2]
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    smooth = cv2.bilateralFilter(gray, 9, 65, 65)
    edges = cv2.Canny(smooth, 35, 130)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidate = None
    best_score = 0.0
    image_area = float(width * height)
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < image_area * 0.045:
            continue
        points = four_corners(contour)
        if points is None:
            continue
        rectangle = cv2.minAreaRect(points.astype(np.float32))
        short, long = sorted(rectangle[1])
        if short < 1:
            continue
        ratio = long / short
        # Indian identity cards are normally close to CR80 (1.586), but a
        # generous interval also supports voter cards and scan perspective.
        if ratio < 1.18 or ratio > 2.25:
            continue
        score = (area / image_area) * (1.0 - min(abs(ratio - 1.586) / 1.586, 0.65))
        if score > best_score:
            best_score, candidate = score, points

    if candidate is None:
        raise ValueError("No reliable card contour")

    points = ordered(candidate / scale)
    top = np.linalg.norm(points[1] - points[0])
    bottom = np.linalg.norm(points[2] - points[3])
    left = np.linalg.norm(points[3] - points[0])
    right = np.linalg.norm(points[2] - points[1])
    out_w, out_h = max(2, round(max(top, bottom))), max(2, round(max(left, right)))
    destination = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(points, destination)
    output = cv2.warpPerspective(image, matrix, (out_w, out_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    if output.shape[0] > output.shape[1]:
        output = cv2.rotate(output, cv2.ROTATE_90_CLOCKWISE)

    ok, encoded = cv2.imencode(".jpg", output, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    if not ok:
        raise ValueError("Could not encode crop")
    normalized = [{"x": round(float(x / source_w), 6), "y": round(float(y / source_h), 6)} for x, y in points]
    return {
        "image": "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii"),
        "corners": normalized,
        "confidence": round(min(0.99, 0.45 + best_score * 1.8), 3)
    }


def main():
    image = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported image")
    print(json.dumps(detect(image), separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(2)
