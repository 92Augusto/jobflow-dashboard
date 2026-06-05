import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';

// Read SuperficieTab.tsx to get MEMORIA_B64
const content = fs.readFileSync('c:/Users/augus/Documents/jobflow-dashboard/src/components/SuperficieTab.tsx', 'utf-8');
const match = content.match(/const MEMORIA_B64 = "([^"]+)"/);

function b64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

if (!match) throw new Error("No MEMORIA_B64");

// Test for N sides
for (const N of [3, 6, 10, 30]) {
  try {
    const zip = new PizZip(b64ToUint8(match[1]));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() { return ""; }
    });

    const lados = Array.from({length: N}, (_, i) => ({ linea: `Lado ${i+1}: 100 m` }));
    const angulos = Array.from({length: N}, (_, i) => ({ linea: `Ángulo ${i+1}: 90°` }));

    doc.render({
      rumbo_linea: "N 10 E",
      lados,
      angulos,
      superficie_linea: "1000 m2"
    });

    const out = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    fs.writeFileSync(`test_n_${N}.docx`, out);
    console.log(`Success for N=${N}`);
  } catch (err) {
    console.error(`Error for N=${N}:`, err);
  }
}
