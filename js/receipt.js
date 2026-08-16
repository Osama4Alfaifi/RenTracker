const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDRED_PREFIX = ["", "", "", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثمان", "تسع"];

function threeDigitsToWords(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h === 1) parts.push("مئة");
  else if (h === 2) parts.push("مئتان");
  else if (h > 0) parts.push(`${HUNDRED_PREFIX[h]} مئة`);

  if (rem > 0) {
    if (rem < 10) parts.push(ONES[rem]);
    else if (rem < 20) parts.push(TEENS[rem - 10]);
    else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      parts.push(o > 0 ? `${ONES[o]} و${TENS[t]}` : TENS[t]);
    }
  }
  return parts.join(" و");
}

// Converts a whole number into Arabic words, following standard counted-noun
// agreement for the thousand/million scale words (dual, 3-10 plural, 11+ singular).
export function numberToArabicWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return "صفر";

  const million = Math.floor(num / 1000000);
  const thousand = Math.floor((num % 1000000) / 1000);
  const rest = num % 1000;
  const parts = [];

  if (million > 0) {
    if (million === 1) parts.push("مليون");
    else if (million === 2) parts.push("مليونان");
    else if (million <= 10) parts.push(`${threeDigitsToWords(million)} ملايين`);
    else parts.push(`${threeDigitsToWords(million)} مليون`);
  }
  if (thousand > 0) {
    if (thousand === 1) parts.push("ألف");
    else if (thousand === 2) parts.push("ألفان");
    else if (thousand <= 10) parts.push(`${threeDigitsToWords(thousand)} آلاف`);
    else parts.push(`${threeDigitsToWords(thousand)} ألف`);
  }
  if (rest > 0) parts.push(threeDigitsToWords(rest));

  return parts.join(" و");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`فشل تحميل ${src}`));
    document.head.appendChild(s);
  });
}

async function ensurePdfLibs() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
}

function buildReceiptHtml({ receivedFrom, amount, methodText, unitLabel, buildingName, monthName, monthNum, year, dateStr }) {
  const amountWords = `${numberToArabicWords(amount)} ريال سعودي`;
  return `
    <div style="width:900px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;border:4px solid #9c7a2d;box-sizing:border-box;background:white;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:3px solid #9c7a2d;">
        <div style="font-size:28px;font-weight:800;color:#1c2333;">تطوير ساس العقارية</div>
        <img src="assets/logo.png" style="width:90px;height:90px;border-radius:50%;" />
      </div>
      <div style="text-align:center;font-size:34px;font-weight:800;padding:14px;border-bottom:3px solid #9c7a2d;color:#1c2333;">سند قبض</div>
      <div style="padding:10px 28px;font-size:22px;font-weight:700;line-height:2.1;color:#1c2333;">
        <div>استلمت من: ${escapeHtml(receivedFrom)}</div>
        <div>مبلغا وقدره: ${amount.toLocaleString("en")} (${amountWords})</div>
        <div>كاش/تحويل: ${methodText}</div>
        <div>وذلك عن: إيجار ${escapeHtml(unitLabel)} في مجمع ${escapeHtml(buildingName)} لشهر ${monthNum} (${monthName}) ${year}</div>
        <div>بتاريخ: ${dateStr}</div>
      </div>
      <div style="padding:10px 28px;font-size:16px;font-weight:700;border-top:3px solid #9c7a2d;color:#1c2333;">
        ملحوظة: تم عمل نسختين من هذا السند نسخه مع المكتب ونسخة مع المستأجر
      </div>
      <div style="display:flex;justify-content:space-between;padding:16px 28px 24px;font-size:20px;font-weight:800;color:#1c2333;">
        <div style="text-align:center;">
          <div>المستلم:</div>
          <img src="assets/signature.png" style="width:120px;height:auto;margin-top:4px;" />
        </div>
        <div style="text-align:center;align-self:flex-end;">
          <div>المسلم:</div>
          <div style="width:180px;border-bottom:2px solid #333;height:28px;margin-top:20px;"></div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function downloadReceiptPdf(data) {
  await ensurePdfLibs();

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.innerHTML = buildReceiptHtml(data);
  document.body.appendChild(container);

  try {
    // Wait for the logo/signature images to actually load before rasterizing.
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) return resolve();
            img.onload = resolve;
            img.onerror = resolve;
          })
      )
    );

    const canvas = await window.html2canvas(container.firstElementChild, { scale: 2, backgroundColor: "#ffffff" });
    const { jsPDF } = window.jspdf;
    const widthMm = 250;
    const heightMm = (canvas.height / canvas.width) * widthMm;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [widthMm, heightMm] });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, widthMm, heightMm);
    doc.save(`سند قبض - ${data.unitLabel} - ${data.monthName} ${data.year}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
