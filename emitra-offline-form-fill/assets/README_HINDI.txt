Rajasthan Forms Auto Fill Tool - One JSON Config

Is version me Caste Certificate aur Bonafide / Mool Niwas dono forms ki field positions ek hi JSON file me hain:
assets/forms-fields-config.json

Use:
1. index.html open karo.
2. Dropdown se Caste ya Mool Niwas form choose karo.
3. Data fill karo.
4. Preview Refresh, Download PDF ya Print PDF use karo.

Install path:
public/tools/rajasthan-forms-autofill-tool/

Live link:
/tools/rajasthan-forms-autofill-tool/index.html

Important:
- Ab caste-fields-config.json aur bonafide-fields-config.json alag se required nahi hain.
- Agar Position Editor me change karo aur Download Config dabao, to combined forms-fields-config.json download hogi.
- Us downloaded file ko assets/forms-fields-config.json se replace karna.

Update:
- Mool Niwas / Bonafide me shapat-patra auto selection: Vivahit mahila related fields me data ho to sirf vivahit mahila shapat-patra fill hoga; warna age ke hisab se balig/nabalig fill hoga.


Latest Fix:
- Caste form me agar candidate ki age 18 se kam hai to page 3 shapat-patra candidate ke pita ke naam se auto fill hoga.
- Iske liye caste form me "पिता के पिता का नाम" field add ki gayi hai. Age 18 ya jyada hone par normal candidate ka shapat-patra fill hoga.
- Mool Niwas/Bonafide me vivahit mahila, balig aur nabalig shapat-patra auto condition same rahenge.

Update:
- Auto Hindi Typing ON hai. Naam, pata, gaon, tehsil, caste, occupation jaise text fields me Roman type karne par Hindi me convert hoga.
- Aadhaar, mobile, DOB, date, age jaise number/date fields auto Hindi me convert nahi honge.
- Header me Auto Hindi Typing checkbox se ON/OFF kar sakte hain.
