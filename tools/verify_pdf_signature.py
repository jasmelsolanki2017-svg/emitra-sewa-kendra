#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime


def iso_date(value):
    if not value:
        return ""
    try:
        if isinstance(value, datetime):
            return value.isoformat()
    except Exception:
        pass
    return str(value)


def empty_result():
    return {
        "embeddedSignatureFound": False,
        "signatureStatus": "NO_SIGNATURE",
        "documentModifiedAfterSigning": "Unknown",
        "signerName": "",
        "signingTime": "",
        "reason": "",
        "location": "",
        "certificateIssuer": "",
        "certificateSubject": "",
        "certificateValidFrom": "",
        "certificateValidTo": "",
        "trustStatus": "",
        "errors": [],
    }


def structural_signature_probe(path):
    result = empty_result()
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except Exception as exc:
        result["signatureStatus"] = "NOT_VERIFIED"
        result["errors"].append(f"PDF read failed: {exc}")
        return result

    has_signature_markers = bool(
        re.search(rb"/ByteRange\s*\[", data)
        or re.search(rb"/SubFilter\s*/(?:adbe\.pkcs7\.detached|ETSI\.CAdES\.detached)", data)
        or re.search(rb"/FT\s*/Sig\b", data)
    )
    result["embeddedSignatureFound"] = has_signature_markers
    result["signatureStatus"] = "NOT_VERIFIED" if has_signature_markers else "NO_SIGNATURE"
    if has_signature_markers:
        result["trustStatus"] = "Embedded signature markers found; pyHanko validation required"
    return result


def try_extract_qr_text(path):
    try:
        import fitz
        import cv2
        import numpy as np
    except Exception:
        return {"qrFound": False, "qrText": "", "errors": []}

    try:
        detector = cv2.QRCodeDetector()
        doc = fitz.open(path)
        for page_index in range(min(len(doc), 3)):
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            text, _points, _straight = detector.detectAndDecode(image)
            if text:
                return {"qrFound": True, "qrText": str(text), "errors": []}
        return {"qrFound": False, "qrText": "", "errors": []}
    except Exception as exc:
        return {"qrFound": False, "qrText": "", "errors": [f"QR decode failed: {exc}"]}


def cert_name(name):
    if not name:
        return ""
    try:
        return name.human_friendly
    except Exception:
        return str(name)


def run_pyhanko_validation(path):
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.sign.fields import enumerate_sig_fields
    from pyhanko.sign.validation import validate_pdf_signature

    result = empty_result()
    with open(path, "rb") as handle:
        reader = PdfFileReader(handle)
        sig_fields = list(enumerate_sig_fields(reader))
        if not sig_fields:
            return result

        result["embeddedSignatureFound"] = True
        field_name, sig_obj, _field_ref = sig_fields[0]
        status = validate_pdf_signature(reader, field_name)
        signer_cert = getattr(status, "signer_cert", None)

        intact = bool(getattr(status, "intact", False))
        valid = bool(getattr(status, "valid", False))
        trusted = bool(getattr(status, "trusted", False))
        modification_level = str(getattr(status, "modification_level", "") or "")

        result["documentModifiedAfterSigning"] = not intact if intact is not None else "Unknown"
        if not intact or "LTA_UPDATES" not in modification_level and "NONE" not in modification_level and modification_level:
            result["signatureStatus"] = "MODIFIED" if not intact else "NOT_VERIFIED"
        elif valid and trusted:
            result["signatureStatus"] = "VALID"
        elif valid:
            result["signatureStatus"] = "NOT_VERIFIED"
        else:
            result["signatureStatus"] = "INVALID"

        result["trustStatus"] = "Trusted" if trusted else "Certificate trust chain not verified"
        result["signerName"] = cert_name(getattr(signer_cert, "subject", "")) if signer_cert else ""
        result["certificateSubject"] = cert_name(getattr(signer_cert, "subject", "")) if signer_cert else ""
        result["certificateIssuer"] = cert_name(getattr(signer_cert, "issuer", "")) if signer_cert else ""
        result["certificateValidFrom"] = iso_date(getattr(signer_cert, "not_valid_before", ""))
        result["certificateValidTo"] = iso_date(getattr(signer_cert, "not_valid_after", ""))

        try:
            signer_info = getattr(status, "signer_reported_dt", None)
            result["signingTime"] = iso_date(signer_info)
        except Exception:
            pass

        try:
            result["reason"] = str(sig_obj.get("/Reason", "") or "").strip()
            result["location"] = str(sig_obj.get("/Location", "") or "").strip()
            sig_name = str(sig_obj.get("/Name", "") or "").strip()
            if sig_name:
                result["signerName"] = sig_name
        except Exception:
            pass

    return result


def main():
    if len(sys.argv) < 2:
        result = empty_result()
        result["signatureStatus"] = "NOT_VERIFIED"
        result["errors"].append("PDF path missing")
        print(json.dumps(result))
        return

    path = sys.argv[1]
    fallback = structural_signature_probe(path)
    try:
        result = run_pyhanko_validation(path)
        qr = try_extract_qr_text(path)
        result["qrFound"] = qr["qrFound"]
        result["qrText"] = qr["qrText"]
        result["errors"].extend(qr["errors"])
        if fallback["embeddedSignatureFound"] and not result["embeddedSignatureFound"]:
            result["embeddedSignatureFound"] = True
            result["signatureStatus"] = "NOT_VERIFIED"
            result["trustStatus"] = "Signature marker found; pyHanko could not enumerate field"
        print(json.dumps(result, ensure_ascii=False))
    except ImportError as exc:
        qr = try_extract_qr_text(path)
        fallback["qrFound"] = qr["qrFound"]
        fallback["qrText"] = qr["qrText"]
        fallback["errors"].extend(qr["errors"])
        fallback["errors"].append(f"pyHanko not installed: {exc}")
        print(json.dumps(fallback, ensure_ascii=False))
    except Exception as exc:
        qr = try_extract_qr_text(path)
        fallback["qrFound"] = qr["qrFound"]
        fallback["qrText"] = qr["qrText"]
        fallback["errors"].extend(qr["errors"])
        fallback["errors"].append(f"pyHanko validation failed: {exc}")
        if fallback["embeddedSignatureFound"]:
            fallback["signatureStatus"] = "NOT_VERIFIED"
        print(json.dumps(fallback, ensure_ascii=False))


if __name__ == "__main__":
    main()
