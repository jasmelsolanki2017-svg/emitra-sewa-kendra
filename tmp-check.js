require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
(async () => {
  const dummyPdf = Buffer.from('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 18 Tf 50 90 Td (Hello PDF) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000062 00000 n \n0000000119 00000 n \n0000000206 00000 n \n0000000300 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF');
  const path = 'validation-test/' + Date.now() + '-demo.pdf';
  const { data, error } = await supabase.storage.from('pdf-verification').upload(path, dummyPdf, { contentType: 'application/pdf', upsert: true });
  console.log(JSON.stringify({ path, data, error: error ? { message: error.message, status: error.status, name: error.name } : null }, null, 2));
})();
