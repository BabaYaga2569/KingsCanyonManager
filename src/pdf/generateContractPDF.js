import jsPDF from "jspdf";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
};

export default async function generateContractPDF(contract, logoDataUrl) {
  const docPDF = new jsPDF({ unit: "pt", format: "letter" });
  const W = docPDF.internal.pageSize.getWidth();
  const H = docPDF.internal.pageSize.getHeight();

  // Frame / border
  docPDF.setDrawColor(60);
  docPDF.setLineWidth(1);
  docPDF.rect(28, 28, W - 56, H - 56);

  // Header
  if (logoDataUrl) {
    docPDF.addImage(logoDataUrl, "PNG", 40, 42, 60, 60);
  }

  // Company info on the left
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(14);
  docPDF.text(COMPANY.name, 110, 50);
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  docPDF.text(COMPANY.cityState, 110, 66);
  docPDF.text(`${COMPANY.phone}`, 110, 80);
  docPDF.text(COMPANY.email, 110, 94);

  // Title on the right
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(14);
  docPDF.text("Service Contract", W - 40, 50, { align: "right" });
  docPDF.text("Agreement", W - 40, 66, { align: "right" });

  // Contract meta
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  docPDF.text(`Contract No.: ${contract.id.slice(-8)}`, W - 40, 84, { align: "right" });
  docPDF.text(`Date: ${new Date().toLocaleDateString()}`, W - 40, 98, { align: "right" });

  // Divider
  docPDF.setDrawColor(150);
  docPDF.line(40, 120, W - 40, 120);

  // Project details
  let y = 140;

  const writeLabelValue = (label, value) => {
    docPDF.setFont("helvetica", "bold");
    docPDF.text(`${label}:`, 40, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(`${value || "N/A"}`, 140, y, { maxWidth: W - 180 });
    y += 18;
  };

  writeLabelValue("Client", contract.clientName);
  writeLabelValue("Status", contract.status || "Pending");
  // Contract amount — custom layout so label doesn't overlap value
  docPDF.setFont("helvetica", "bold");
  docPDF.text("Contract Amount:", 40, y);
  docPDF.setFont("helvetica", "normal");
  docPDF.text(contract.amount ? `$${contract.amount}` : "N/A", 160, y);
  y += 14;
  docPDF.setFont("helvetica", "italic");
  docPDF.setFontSize(9);
  docPDF.setTextColor(100);
  docPDF.text("(Labor only — materials billed separately at actual cost)", 40, y);
  docPDF.setFontSize(10);
  docPDF.setTextColor(0);
  docPDF.setFont("helvetica", "normal");
  y += 18;

  docPDF.setFont("helvetica", "bold");
  docPDF.text("Description:", 40, y);
  docPDF.setFont("helvetica", "normal");
  const desc = docPDF.splitTextToSize(contract.description || "N/A", W - 180);
  docPDF.text(desc, 140, y);
  y += desc.length * 14 + 10;

  // Legal sections
  y += 10;
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Scope of Work", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "Work to be performed is described above. Any changes or additions requested by the client that are not listed will be treated as a change order and may affect price and timeline.",
    40,
    y,
    W - 80
  );
  y += 8;

  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Payment Terms", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "A deposit of 50% of the total contract amount is required before work begins. The remaining balance is due upon substantial completion of the project. Invoices are due within 14 days. A late payment fee of 5% may be applied to balances over 15 days past due.",
    40,
    y,
    W - 80
  );
  y += 8;

  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Materials Cost", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "This contract covers labor only. All materials required for this project will be purchased by Kings Canyon Landscaping LLC and billed to the client at actual cost, separate from and in addition to the contract amount above. A materials estimate is provided for reference; final materials cost will reflect actual purchase receipts and will be invoiced upon completion.",
    40,
    y,
    W - 80
  );
  y += 8;

  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Warranty & Liability", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "All workmanship is warranted for 30 days from completion against defects in installation. Materials are covered by their manufacturer warranties where applicable. Kings Canyon Landscaping is not responsible for damage caused by misuse, neglect, or acts of nature.",
    40,
    y,
    W - 80
  );
  y += 8;

  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Cancellation Policy", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "Client may cancel before work begins. If materials have been ordered or delivered, a restocking fee of up to 20% and any non-refundable charges will apply. If work has begun, client will be responsible for labor and materials incurred to date.",
    40,
    y,
    W - 80
  );
  y += 16;

  // Signatures section
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(11);
  docPDF.text("Authorization & Acceptance", 40, y);
  y += 14;
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  y = writeParagraph(
    docPDF,
    "By signing below, both parties agree to the terms of this agreement. Digital signatures are valid and binding.",
    40,
    y,
    W - 80
  );
  y += 20;

  // Signature boxes
  const sigTop = y;
  const sigBoxH = 80;
  const col1X = 40;
  const col2X = W / 2 + 10;
  const boxW = W - 40 - col2X;

  docPDF.setDrawColor(120);
  docPDF.rect(col1X, sigTop, boxW, sigBoxH);
  docPDF.rect(col2X, sigTop, boxW, sigBoxH);

  if (contract.clientSignature) {
    docPDF.addImage(contract.clientSignature, "PNG", col1X + 6, sigTop + 6, boxW - 12, sigBoxH - 12);
  }
  if (contract.contractorSignature) {
    docPDF.addImage(contract.contractorSignature, "PNG", col2X + 6, sigTop + 6, boxW - 12, sigBoxH - 12);
  }

  y = sigTop + sigBoxH + 16;
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(10);
  docPDF.text("Client Signature", col1X, y);
  docPDF.text("Contractor Signature", col2X, y);
  y += 12;

  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(9);
  docPDF.text(`Client: ${contract.clientName || "N/A"}`, col1X, y);
  docPDF.text(`Company: ${COMPANY.name}`, col2X, y);
  y += 12;

  docPDF.text(`Signed: ${contract.clientSignedAt || "—"}`, col1X, y);
  docPDF.text(`Signed: ${contract.contractorSignedAt || "—"}`, col2X, y);

  // Footer
  docPDF.setFontSize(9);
  docPDF.setTextColor(100);
  docPDF.text(
    "Thank you for choosing Kings Canyon Landscaping. We appreciate your business.",
    W / 2,
    H - 36,
    { align: "center" }
  );

  return docPDF;
}

function writeParagraph(doc, text, x, yStart, maxWidth) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, yStart);
  return yStart + lines.length * 12;
}