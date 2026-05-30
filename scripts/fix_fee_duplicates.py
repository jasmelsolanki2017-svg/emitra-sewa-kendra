import re
from pathlib import Path

root = Path(r'f:\git repo\emitra-sewa-kendra')
pattern = re.compile(
    r"""(\s*)const structuredApplicationFee = flexibleRowsFromValue\(getFlexibleField\(job, \"applicationFee\"\), \{\n(.*?)\n\s*\}\)\.map\(\(row\) => \(\{ \.\.\.row, htmlValue:renderFlexibleCell\(row\.value\) \}\)\);\n\s*renderList\(\"feeList\", \"feePanel\", \[\n(.*?)\n\s*\]\);\n\s*renderManualContent\(\"feeManual\", \"feePanel\", job\.applicationFeeManual, \"Other Application Fee\"\);""",
    re.DOTALL,
)
replace = r"\1const feeRows = [\n      { label:\"General / OBC Fee\", value:job.generalObcFee },\n      { label:\"SC / ST Fee\", value:job.scStFee },\n      { label:\"Female Fee\", value:job.femaleFee },\n      { label:\"OBC Female Fee\", value:job.obcFemaleFee },\n      { label:\"SC Female Fee\", value:job.scFemaleFee },\n      { label:\"PH Candidate Fee\", value:job.phCandidateFee || job.onlyFemaleFee },\n      { label:\"STA B General / OBC / EWS\", value:job.staBGeneralFee },\n      { label:\"STA B SC / ST / PH / Female\", value:job.staBScStFemaleFee },\n      { label:\"STA B Refund Fee\", value:job.staBRefundFee },\n      { label:\"Tech A General / OBC / EWS\", value:job.techAGeneralFee },\n      { label:\"Tech A SC / ST / PH / Female\", value:job.techAScStFemaleFee },\n      { label:\"Tech A Refund Fee\", value:job.techARefundFee },\n      { label:\"Single Exam Fee\", value:job.singleExamFee || job.oneExamFee },\n      { label:\"Both Exam Fee\", value:job.bothExamFee || job.combinedExamFee || job.twoExamFee },\n      { label:\"Payment Mode\", value:job.paymentMode }\n    ];\n    const structuredApplicationFee = flexibleRowsFromValue(getFlexibleField(job, \"applicationFee\"), {\n      generalObc:\"General / OBC Fee\",\n      general:\"General / OBC Fee\",\n      obc:\"OBC Fee\",\n      scSt:\"SC / ST Fee\",\n      sc:\"SC Fee\",\n      st:\"ST Fee\",\n      female:\"Female Fee\",\n      paymentMode:\"Payment Mode\"\n    }).map((row) => ({ ...row, htmlValue:renderFlexibleCell(row.value) }));\n    const existingFeeLabels = new Set(feeRows.map((row) => String(row.label || \"\").trim().toLowerCase()));\n    const uniqueApplicationFeeRows = [];\n    const addedFeeLabels = new Set(existingFeeLabels);\n    structuredApplicationFee.forEach((row) => {\n      const label = String(row.label || \"\").trim().toLowerCase();\n      if(label && !addedFeeLabels.has(label)){\n        addedFeeLabels.add(label);\n        uniqueApplicationFeeRows.push(row);\n      }\n    });\n    renderList(\"feeList\", \"feePanel\", [\n      ...feeRows,\n      ...uniqueApplicationFeeRows\n    ]);\n    renderManualContent(\"feeManual\", \"feePanel\", job.applicationFeeManual, \"Other Application Fee\");"

files = list(root.rglob('**/*.html'))
updated = []
for file in files:
    text = file.read_text(encoding='utf-8')
    if 'const structuredApplicationFee = flexibleRowsFromValue(getFlexibleField(job, "applicationFee"),' not in text:
        continue
    new_text, count = pattern.subn(replace, text)
    if count:
        file.write_text(new_text, encoding='utf-8')
        updated.append((file, count))

print('updated', len(updated), 'files')
for f, c in updated:
    print(f.relative_to(root), c)
