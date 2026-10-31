"""Robust ID-card boundary detection and perspective correction using OpenCV.

Input/output are exchanged through a temporary file and stdout JSON. No source
image or crop is retained by this script.
"""
import base64
import json
import sys

import cv2
import numpy as np


def order_corners(points):
    """Return corners as top-left, top-right, bottom-right, bottom-left."""
    pts = np.asarray(points, dtype=np.float32).reshape(4, 2)
    center = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0])
    pts = pts[np.argsort(angles)]
    # Rotate sequence so the first point is the top-most/left-most corner.
    start = int(np.argmin(pts[:, 0] + pts[:, 1]))
    pts = np.roll(pts, -start, axis=0)
    if pts[1, 0] < pts[-1, 0]:
        pts = pts[[0, 3, 2, 1]]
    return pts.astype(np.float32)


def candidate_quads(contour):
    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return []
    found = []
    for epsilon in (0.012, 0.018, 0.025, 0.035, 0.05, 0.07):
        poly = cv2.approxPolyDP(contour, epsilon * perimeter, True)
        if len(poly) == 4 and cv2.isContourConvex(poly):
            found.append(poly.reshape(4, 2))
    # A minimum-area rectangle is a useful fallback for slightly rounded or
    # noisy card edges, but is accepted only when the contour fills it well.
    rect = cv2.minAreaRect(contour)
    rw, rh = rect[1]
    rect_area = float(rw * rh)
    contour_area = abs(float(cv2.contourArea(contour)))
    if rect_area > 0 and contour_area / rect_area >= 0.42:
        found.append(cv2.boxPoints(rect))
    return found


def detect(image):
    source_h, source_w = image.shape[:2]
    if source_h < 80 or source_w < 80:
        raise ValueError("Image resolution is too small")
    scale = min(1.0, 1800.0 / max(source_h, source_w))
    working = cv2.resize(
        image, (max(1, round(source_w * scale)), max(1, round(source_h * scale))),
        interpolation=cv2.INTER_AREA
    ) if scale < 1 else image.copy()
    height, width = working.shape[:2]
    image_area = float(width * height)
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    smooth = cv2.bilateralFilter(gray, 7, 55, 55)

    # Use more than one edge/threshold view: camera glare, shadows and flat
    # scanner backgrounds can defeat a single Canny threshold.
    edge_maps = []
    for low, high in ((25, 90), (45, 140), (70, 190)):
        edge = cv2.Canny(smooth, low, high)
        edge = cv2.morphologyEx(
            edge, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2
        )
        edge_maps.append(edge)
    adaptive = cv2.adaptiveThreshold(
        smooth, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 31, 11
    )
    adaptive = cv2.morphologyEx(
        adaptive, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2
    )
    edge_maps.append(adaptive)

    best = None
    best_score = 0.0
    for edge_map in edge_maps:
        contours, _ = cv2.findContours(
            edge_map, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
        )
        for contour in contours:
            area = abs(float(cv2.contourArea(contour)))
            if area < image_area * 0.035:
                continue
            for raw_quad in candidate_quads(contour):
                quad = order_corners(raw_quad)
                edges = [
                    np.linalg.norm(quad[1] - quad[0]),
                    np.linalg.norm(quad[2] - quad[3]),
                    np.linalg.norm(quad[3] - quad[0]),
                    np.linalg.norm(quad[2] - quad[1])
                ]
                card_w = (edges[0] + edges[1]) / 2.0
                card_h = (edges[2] + edges[3]) / 2.0
                if min(card_w, card_h) < 35:
                    continue
                ratio = max(card_w, card_h) / min(card_w, card_h)
                if ratio < 1.15 or ratio > 2.45:
                    continue
                quad_area = abs(float(cv2.contourArea(quad)))
                area_fraction = quad_area / image_area
                if area_fraction < 0.035 or area_fraction > 0.97:
                    continue
                # Prefer large, card-shaped quadrilaterals; penalize extreme
                # ratios while allowing Aadhaar, voter and other ID formats.
                ratio_fit = max(0.0, 1.0 - abs(ratio - 1.586) / 1.586)
                rectangularity = min(1.0, area / max(quad_area, 1.0))
                score = area_fraction * (0.55 + 0.45 * ratio_fit) * min(1.0, rectangularity + 0.25)
                if score > best_score:
                    best_score, best = score, quad

    if best is None:
        raise ValueError("No reliable card boundary found; keep the full card visible with contrast from the background")

    points = best / scale
    # Preserve a small safety margin against shaving off the physical card edge.
    center = points.mean(axis=0)
    points = center + (points - center) * 1.008
    points[:, 0] = np.clip(points[:, 0], 0, source_w - 1)
    points[:, 1] = np.clip(points[:, 1], 0, source_h - 1)
    points = order_corners(points)

    top = np.linalg.norm(points[1] - points[0])
    bottom = np.linalg.norm(points[2] - points[3])
    left = np.linalg.norm(points[3] - points[0])
    right = np.linalg.norm(points[2] - points[1])
    out_w = max(2, round(max(top, bottom)))
    out_h = max(2, round(max(left, right)))
    destination = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32
    )
    matrix = cv2.getPerspectiveTransform(points.astype(np.float32), destination)
    output = cv2.warpPerspective(
        image, matrix, (out_w, out_h), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )
    # Standard ID cards are landscape. Rotate portrait captures after warp.
    if output.shape[0] > output.shape[1]:
        output = cv2.rotate(output, cv2.ROTATE_90_CLOCKWISE)
    ok, encoded = cv2.imencode(
        ".jpg", output, [int(cv2.IMWRITE_JPEG_QUALITY), 96]
    )
    if not ok:
        raise ValueError("Could not encode corrected crop")
    normalized = [
        {"x": round(float(x / source_w), 6), "y": round(float(y / source_h), 6)}
        for x, y in points
    ]
    return {
        "image": "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii"),
        "corners": normalized,
        "confidence": round(min(0.99, 0.35 + best_score * 2.0), 3)
    }


def main():
    if len(sys.argv) < 2:
        raise ValueError("Image path missing")
    image = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported or unreadable image")
    print(json.dumps(detect(image), separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(2)
