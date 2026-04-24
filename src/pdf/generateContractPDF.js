import jsPDF from "jspdf";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

function writeParagraph(doc, text, x, yStart, maxWidth) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, yStart);
  return yStart + lines.length * 12;
}

function sectionHeader(doc, title, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, 40, y);
  return y + 14;
}

function bodyText(doc, text, y, W) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return writeParagraph(doc, text, 40, y, W - 80);
}

function buildHeader(docPDF, contract, logoDataUrl, titleLine1, titleLine2, W) {
  // Border
  const H = docPDF.internal.pageSize.getHeight();
  docPDF.setDrawColor(60);
  docPDF.setLineWidth(1);
  docPDF.rect(28, 28, W - 56, H - 56);

  // Logo
  if (logoDataUrl) docPDF.addImage(logoDataUrl, "PNG", 40, 42, 60, 60);

  // Company info
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(14);
  docPDF.text(COMPANY.name, 110, 50);
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  docPDF.text(COMPANY.cityState, 110, 66);
  docPDF.text(COMPANY.phone, 110, 80);
  docPDF.text(COMPANY.email, 110, 94);

  // Title
  docPDF.setFont("helvetica", "bold");
  docPDF.setFontSize(14);
  docPDF.text(titleLine1, W - 40, 50, { align: "right" });
  docPDF.text(titleLine2, W - 40, 66, { align: "right" });

  // Contract meta
  docPDF.setFont("helvetica", "normal");
  docPDF.setFontSize(10);
  const contractNum = contract.id ? contract.id.slice(-8) : "N/A";
  docPDF.text(`Contract No.: ${contractNum}`, W - 40, 84, { align: "right" });
  docPDF.text(`Date: ${new Date().toLocaleDateString()}`, W - 40, 98, { align: "right" });

  // Divider
  docPDF.setDrawColor(150);
  docPDF.line(40, 120, W - 40, 120);
}

function buildSignatures(docPDF, contract, y, W) {
  const sigBoxH = 80;
  const col1X = 40;
  const col2X = W / 2 + 10;
  const boxW = W - 40 - col2X;

  docPDF.setDrawColor(120);
  docPDF.rect(col1X, y, boxW, sigBoxH);
  docPDF.rect(col2X, y, boxW, sigBoxH);

  if (contract.clientSignature) {
    docPDF.addImage(contract.clientSignature, "PNG", col1X + 6, y + 6, boxW - 12, sigBoxH - 12);
  }
  if (contract.contractorSignature) {
    docPDF.addImage(contract.contractorSignature, "PNG", col2X + 6, y + 6, boxW - 12, sigBoxH - 12);
  }

  y += sigBoxH + 16;
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
}

function buildFooter(docPDF, W, H) {
  docPDF.setFontSize(9);
  docPDF.setTextColor(100);
  docPDF.text(
    "Thank you for choosing Kings Canyon Landscaping. We appreciate your business.",
    W / 2,
    H - 36,
    { align: "center" }
  );
  docPDF.setTextColor(0);
}

// ─── Frequency helpers ─────────────────────────────────────────────────────────

function getFrequencyLabel(frequency) {
  switch ((frequency || "").toLowerCase()) {
    case "weekly":    return "Weekly";
    case "biweekly":  return "Bi-Weekly (Every 2 Weeks)";
    case "monthly":   return "Monthly";
    case "quarterly": return "Quarterly";
    default:          return frequency || "As Scheduled";
  }
}

function getVisitsPerMonth(frequency) {
  switch ((frequency || "").toLowerCase()) {
    case "weekly":    return 4;
    case "biweekly":  return 2;
    case "monthly":   return 1;
    case "quarterly": return 0; // billed per visit
    default:          return null;
  }
}

// ─── MAINTENANCE CONTRACT PDF ──────────────────────────────────────────────────

function generateMaintenancePDF(contract, logoDataUrl) {
  const docPDF = new jsPDF({ unit: "pt", format: "letter" });
  const W = docPDF.internal.pageSize.getWidth();
  const H = docPDF.internal.pageSize.getHeight();

  buildHeader(docPDF, contract, logoDataUrl, "Maintenance Service", "Agreement", W);

  let y = 140;

  // ── Contract details block ──────────────────────────────────
  const frequency     = contract.frequency || "biweekly";
  const freqLabel     = getFrequencyLabel(frequency);
  const visitsPerMonth = getVisitsPerMonth(frequency);
  const monthlyRate   = contract.amount || contract.monthlyRate || 0;

  const visitsText = visitsPerMonth
    ? `${visitsPerMonth} visit${visitsPerMonth > 1 ? "s" : ""}/month`
    : null;
  const rateDisplay = visitsText
    ? `$${monthlyRate}/month (${visitsText})`
    : `$${monthlyRate}/month`;

  const writeLV = (label, value) => {
    docPDF.setFont("helvetica", "bold");
    docPDF.text(`${label}:`, 40, y);
    docPDF.setFont("helvetica", "normal");
    const lines = docPDF.splitTextToSize(`${value || "N/A"}`, W - 200);
    docPDF.text(lines, 160, y);
    y += Math.max(18, lines.length * 14);
  };

  writeLV("Client",            contract.clientName);
  writeLV("Service Frequency", freqLabel);
  writeLV("Monthly Rate",      rateDisplay);

  // Start date
  const proposedDate = contract.startDate
    ? new Date(contract.startDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : "TBD — To Be Confirmed";
  writeLV("Proposed Start Date", proposedDate);
  writeLV("Status", contract.status || "Pending Signature");

  y += 6;
  docPDF.setDrawColor(180);
  docPDF.line(40, y, W - 40, y);
  y += 14;

  // ── Services Included ───────────────────────────────────────
  y = sectionHeader(docPDF, "Services Included", y);
  // Strip "Maintenance Agreement — X Service" title prefix if present
  let services = contract.description || contract.servicesIncluded ||
    "Routine maintenance including trimming, hedging, mowing, checking timers. Additional items like rock installation, landscape work, or irrigation repairs will be billed separately.";
  services = services.replace(/^Maintenance Agreement\s*[—–-]+\s*[\w\s]+Service\s*\n?/i, '').trim();
  y = bodyText(docPDF, services, y, W);
  y += 6;
  docPDF.setFont("helvetica", "italic");
  docPDF.setFontSize(9);
  docPDF.setTextColor(100);
  y = writeParagraph(
    docPDF,
    "Additional work requested outside this agreement will be quoted and billed separately as a one-time service.",
    40, y, W - 80
  );
  docPDF.setFontSize(10);
  docPDF.setTextColor(0);
  y += 10;

  // ── Payment Terms ───────────────────────────────────────────
  y = sectionHeader(docPDF, "Payment Terms", y);
  y = bodyText(
    docPDF,
    `Monthly service rate: $${monthlyRate}/month — ${freqLabel}. Invoices are issued at the beginning of each service month and are due within 14 days of receipt. A late fee of 5% may be applied to balances more than 15 days past due. No deposit is required for ongoing maintenance service. Payment is accepted via Zelle, cash, or check.`,
    y, W
  );
  y += 10;

  // ── Materials & Additional Work ─────────────────────────────
  y = sectionHeader(docPDF, "Materials & Additional Work", y);
  y = bodyText(
    docPDF,
    "The monthly rate covers labor only. Any materials required (plants, rock, irrigation parts, etc.) will be purchased by Kings Canyon Landscaping LLC and billed to the client at actual cost, separate from the monthly service rate. Additional work beyond routine maintenance will be quoted in advance and billed separately.",
    y, W
  );
  y += 10;

  // ── Service Commencement ────────────────────────────────────
  y = sectionHeader(docPDF, "Service Commencement", y);
  const commencementText = proposedDate !== "TBD — To Be Confirmed"
    ? `Service is proposed to begin on or around ${proposedDate}. The actual start date will be confirmed in writing by Kings Canyon Landscaping LLC following receipt of this signed agreement.`
    : `Service start date will be confirmed in writing by Kings Canyon Landscaping LLC following receipt of this signed agreement.`;
  y = bodyText(docPDF, commencementText, y, W);
  y += 10;

  // ── Cancellation & Termination ──────────────────────────────
  y = sectionHeader(docPDF, "Cancellation & Termination", y);
  y = bodyText(
    docPDF,
    "Either party may terminate this agreement with 30 days written notice. No penalty applies for cancellation with proper notice. Services and billing will continue through the end of the notice period. Kings Canyon Landscaping reserves the right to terminate service immediately for non-payment.",
    y, W
  );
  y += 10;

  // ── Warranty & Liability ────────────────────────────────────
  y = sectionHeader(docPDF, "Warranty & Liability", y);
  y = bodyText(
    docPDF,
    "Kings Canyon Landscaping LLC warrants that all work will be performed in a professional and workmanlike manner. We are not responsible for pre-existing conditions, damage caused by weather, acts of nature, or client/third-party actions. Any concerns must be reported within 7 days of service.",
    y, W
  );
  y += 16;

  // ── Authorization & Acceptance ──────────────────────────────
  y = sectionHeader(docPDF, "Authorization & Acceptance", y);
  y = bodyText(
    docPDF,
    "By signing below, both parties agree to the terms of this Maintenance Service Agreement. Digital signatures are valid and legally binding.",
    y, W
  );
  y += 20;

  buildSignatures(docPDF, contract, y, W);
  buildFooter(docPDF, W, H);

  return docPDF;
}

// ─── ONE-TIME SERVICE CONTRACT PDF (unchanged) ─────────────────────────────────

function generateServiceContractPDF(contract, logoDataUrl) {
  const docPDF = new jsPDF({ unit: "pt", format: "letter" });
  const W = docPDF.internal.pageSize.getWidth();
  const H = docPDF.internal.pageSize.getHeight();

  buildHeader(docPDF, contract, logoDataUrl, "Service Contract", "Agreement", W);

  let y = 140;

  const writeLV = (label, value) => {
    docPDF.setFont("helvetica", "bold");
    docPDF.text(`${label}:`, 40, y);
    docPDF.setFont("helvetica", "normal");
    docPDF.text(`${value || "N/A"}`, 140, y, { maxWidth: W - 180 });
    y += 18;
  };

  writeLV("Client", contract.clientName);
  writeLV("Status", contract.status || "Pending");

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

  y += 10;
  y = sectionHeader(docPDF, "Scope of Work", y);
  y = bodyText(docPDF, "Work to be performed is described above. Any changes or additions requested by the client that are not listed will be treated as a change order and may affect price and timeline.", y, W);
  y += 8;

  y = sectionHeader(docPDF, "Payment Terms", y);
  y = bodyText(docPDF, "A deposit of 50% of the total contract amount is required before work begins. The remaining balance is due upon substantial completion of the project. Invoices are due within 14 days. A late payment fee of 5% may be applied to balances over 15 days past due.", y, W);
  y += 8;

  y = sectionHeader(docPDF, "Materials Cost", y);
  y = bodyText(docPDF, "This contract covers labor only. All materials required for this project will be purchased by Kings Canyon Landscaping LLC and billed to the client at actual cost, separate from and in addition to the contract amount above. A materials estimate is provided for reference; final materials cost will reflect actual purchase receipts and will be invoiced upon completion.", y, W);
  y += 8;

  y = sectionHeader(docPDF, "Warranty & Liability", y);
  y = bodyText(docPDF, "All workmanship is warranted for 30 days from completion against defects in installation. Materials are covered by their manufacturer warranties where applicable. Kings Canyon Landscaping is not responsible for damage caused by misuse, neglect, or acts of nature.", y, W);
  y += 8;

  y = sectionHeader(docPDF, "Cancellation Policy", y);
  y = bodyText(docPDF, "Client may cancel before work begins. If materials have been ordered or delivered, a restocking fee of up to 20% and any non-refundable charges will apply. If work has begun, client will be responsible for labor and materials incurred to date.", y, W);
  y += 16;

  y = sectionHeader(docPDF, "Service Commencement", y);
  const proposedDate = contract.startDate
    ? new Date(contract.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const commencementClause = proposedDate
    ? `Service is proposed to begin on or around ${proposedDate}. The actual start date will be mutually agreed upon following client signature and written confirmation by Kings Canyon Landscaping LLC. No work will commence prior to both parties signing this agreement.`
    : `A start date will be mutually agreed upon following client signature and written confirmation by Kings Canyon Landscaping LLC. No work will commence prior to both parties signing this agreement.`;
  y = bodyText(docPDF, commencementClause, y, W);
  y += 16;

  y = sectionHeader(docPDF, "Authorization & Acceptance", y);
  y = bodyText(docPDF, "By signing below, both parties agree to the terms of this agreement. Digital signatures are valid and binding.", y, W);
  y += 20;

  buildSignatures(docPDF, contract, y, W);
  buildFooter(docPDF, W, H);

  return docPDF;
}

// ─── Main export — detects contract type ───────────────────────────────────────

export default async function generateContractPDF(contract, logoDataUrl) {
  if (contract.type === "maintenance_agreement") {
    return generateMaintenancePDF(contract, logoDataUrl);
  }
  return generateServiceContractPDF(contract, logoDataUrl);
}