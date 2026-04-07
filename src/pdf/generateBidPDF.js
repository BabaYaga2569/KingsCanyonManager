import jsPDF from "jspdf";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
};

/**
 * Generate a professional bid PDF with automatic page breaks
 * @param {object} bid - The bid object from Firestore
 * @param {string} logoDataUrl - Base64 encoded logo image
 * @returns {jsPDF} - The generated PDF document
 */
export default async function generateBidPDF(bid, logoDataUrl = null) {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  
  const MARGIN = 40;
  const BOTTOM_MARGIN = 80; // Leave space for footer
  const MAX_Y = H - BOTTOM_MARGIN;
  
  let currentPage = 1;

  // Helper function to check if we need a new page
  const checkPageBreak = (spaceNeeded) => {
    if (y + spaceNeeded > MAX_Y) {
      addFooter();
      doc.addPage();
      currentPage++;
      addHeader();
      y = 150; // Start content after header on new page
      return true;
    }
    return false;
  };

  // Helper function to add header (logo, company info, title)
  const addHeader = () => {
    // Frame / border
    doc.setDrawColor(60);
    doc.setLineWidth(1);
    doc.rect(28, 28, W - 56, H - 56);

    // Logo
    if (logoDataUrl && currentPage === 1) {
      try {
        doc.addImage(logoDataUrl, "PNG", 40, 42, 80, 80);
      } catch (e) {
        console.error("Error adding logo:", e);
      }
    }

    // Company info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(COMPANY.name, 140, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${COMPANY.cityState}`, 140, 84);
    doc.text(`${COMPANY.phone} • ${COMPANY.email}`, 140, 100);

    // "BID PROPOSAL" title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("BID PROPOSAL", W - 40, 64, { align: "right" });

    // Bid meta
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const bidNumber = bid.id ? bid.id.slice(-8).toUpperCase() : 'DRAFT';
    doc.text(`Bid No.: ${bidNumber}`, W - 40, 84, { align: "right" });
    
    const bidDate = bid.createdAt 
      ? new Date(bid.createdAt).toLocaleDateString() 
      : new Date().toLocaleDateString();
    doc.text(`Date: ${bidDate}`, W - 40, 100, { align: "right" });

    // Divider
    doc.setDrawColor(150);
    doc.line(40, 132, W - 40, 132);
  };

  // Helper function to add footer
  const addFooter = () => {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont("helvetica", "italic");
    doc.text(
      "Thank you for considering Kings Canyon Landscaping for your project!",
      W / 2,
      H - 50,
      { align: "center" }
    );
    doc.text(
      "We look forward to serving you.",
      W / 2,
      H - 36,
      { align: "center" }
    );
    
    // Page number
    doc.setFontSize(9);
    doc.text(`Page ${currentPage}`, W / 2, H - 20, { align: "center" });
  };

  // Start first page
  addHeader();
  let y = 156;

  // Helper to write label-value pairs
  const writeLabelValue = (label, value) => {
    checkPageBreak(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    // Draw label on its own line
    doc.text(`${label}:`, MARGIN, y);
    y += 16;
    // Draw value indented on next line
    doc.setFont("helvetica", "normal");
    const textValue = value || "N/A";
    doc.text(`${textValue}`, MARGIN + 12, y, { maxWidth: W - 100 });
    y += 20;
  };

  // Customer and Amount
  writeLabelValue("Customer", bid.customerName);
  writeLabelValue("Estimated Amount (Labor)", bid.amount ? `$${Number(bid.amount).toFixed(2)}` : "N/A");

  // Description section
  y += 10;
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Scope of Work:", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  
  if (bid.description) {
    const descLines = doc.splitTextToSize(bid.description, W - 80);
    
    for (let i = 0; i < descLines.length; i++) {
      checkPageBreak(14);
      doc.text(descLines[i], MARGIN, y);
      y += 14;
    }
    y += 10;
  } else {
    doc.text("No description provided", MARGIN, y);
    y += 24;
  }

  // Materials section
  y += 10;
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.text("Materials (Estimate — Billed Separately at Actual Cost):", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  
  if (bid.materials) {
    const materialLines = doc.splitTextToSize(bid.materials, W - 80);
    
    for (let i = 0; i < materialLines.length; i++) {
      checkPageBreak(14);
      doc.text(materialLines[i], MARGIN, y);
      y += 14;
    }
    y += 10;
  } else {
    doc.text("No materials specified", MARGIN, y);
    y += 24;
  }

  // Notes section (if any)
  if (bid.notes) {
    y += 10;
    checkPageBreak(40);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Notes:", MARGIN, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    
    const notesLines = doc.splitTextToSize(bid.notes, W - 80);
    
    for (let i = 0; i < notesLines.length; i++) {
      checkPageBreak(14);
      doc.text(notesLines[i], MARGIN, y);
      y += 14;
    }
    y += 20;
  }

  // Terms & Conditions
  y += 20;
  checkPageBreak(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Terms & Conditions", MARGIN, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const terms = [
    "This bid is valid for 30 days from the date listed above.",
    "Final pricing may vary based on site conditions and material availability.",
    "A deposit of 50% will be required before work begins.",
    "Payment in full is due upon completion unless other arrangements have been made.",
    "All work will be completed in a professional and timely manner.",
    "Materials Cost: This bid covers labor only. All materials required for this project will be purchased by Kings Canyon Landscaping LLC and billed to the client at actual cost, separate from and in addition to the labor price above. A materials estimate is provided for reference; final materials cost will reflect actual purchase receipts.",
  ];

  terms.forEach((term) => {
    const termLines = doc.splitTextToSize(`• ${term}`, W - 80);
    const termHeight = termLines.length * 12 + 4;
    checkPageBreak(termHeight);
    doc.text(termLines, MARGIN, y);
    y += termLines.length * 12 + 4;
  });

  // ============================================
  // SIGNATURES SECTION - ALWAYS SHOW
  // ============================================
  
  y += 30;
  checkPageBreak(180);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Authorization & Acceptance", MARGIN, y);
  y += 18;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const acceptanceText = doc.splitTextToSize(
    "By signing below, both parties agree to the terms outlined in this bid proposal. Digital signatures are valid and binding.",
    W - 80
  );
  doc.text(acceptanceText, MARGIN, y);
  y += acceptanceText.length * 12 + 20;
  
  checkPageBreak(140);
  
  const sigBoxH = 80;
  const sigBoxW = (W - 100) / 2;
  const col1X = MARGIN;
  const col2X = W / 2 + 10;
  
  doc.setDrawColor(120);
  doc.setLineWidth(1);
  doc.rect(col1X, y, sigBoxW, sigBoxH);
  doc.rect(col2X, y, sigBoxW, sigBoxH);
  
  if (bid.clientSignature) {
    try {
      doc.addImage(bid.clientSignature, "PNG", col1X + 6, y + 6, sigBoxW - 12, sigBoxH - 12);
    } catch (e) {
      console.error("Error adding client signature:", e);
    }
  }
  
  if (bid.contractorSignature) {
    try {
      doc.addImage(bid.contractorSignature, "PNG", col2X + 6, y + 6, sigBoxW - 12, sigBoxH - 12);
    } catch (e) {
      console.error("Error adding contractor signature:", e);
    }
  }
  
  y += sigBoxH + 16;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("Customer Signature", col1X, y);
  doc.text("Contractor Signature", col2X, y);
  y += 14;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Customer: ${bid.customerName || "N/A"}`, col1X, y);
  doc.text(`Company: ${COMPANY.name}`, col2X, y);
  y += 12;
  
  const clientSignedText = bid.clientSignedAt 
    ? `Signed: ${new Date(bid.clientSignedAt).toLocaleDateString()}` 
    : "Date: _______________";
  const contractorSignedText = bid.contractorSignedAt 
    ? `Signed: ${new Date(bid.contractorSignedAt).toLocaleDateString()}` 
    : "Date: _______________";
  
  doc.text(clientSignedText, col1X, y);
  doc.text(contractorSignedText, col2X, y);
  
  y += 20;

  addFooter();

  return doc;
}