import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 296-0217",
  email: "kingscanyon775@gmail.com",
};

const PAYMENT_BASE_URL = "https://landscape-manager-8dad0.web.app/public/pay";

/**
 * Generate a professional invoice PDF with optional material breakdown
 * @param {object} invoice - The invoice object from Firestore
 * @param {array} expenses - Optional: expenses for material breakdown
 * @param {boolean} includeMaterialBreakdown - Whether to include material costs page
 * @returns {jsPDF} - The generated PDF document
 */
export default async function generateInvoicePDF(invoice, expenses = [], includeMaterialBreakdown = false) {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const logoDataUrl = invoice.logoDataUrl;

  // ============================================
  // PAGE 1: INVOICE
  // ============================================

  // Frame / border
  doc.setDrawColor(60);
  doc.setLineWidth(1);
  doc.rect(20, 20, W - 40, H - 40);

  // Header with logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 40, 42, 80, 80);
    } catch (e) {
      console.warn("Logo failed to load:", e);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(COMPANY.name, 140, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(COMPANY.cityState, 140, 84);
  doc.text(`${COMPANY.phone} • ${COMPANY.email}`, 140, 100);

  // "INVOICE" title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INVOICE", W - 40, 64, { align: "right" });

  // Invoice meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const invoiceNum = invoice.id ? invoice.id.slice(-8).toUpperCase() : "DRAFT";
  doc.text(`Invoice No.: ${invoiceNum}`, W - 40, 84, { align: "right" });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, W - 40, 100, { align: "right" });

  // Divider
  doc.setDrawColor(150);
  doc.line(40, 132, W - 40, 132);

  // Bill To section
  let y = 156;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Bill To:", 40, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  doc.text(invoice.clientName || "Client Name", 40, y);
  y += 16;

  if (invoice.clientEmail) {
    doc.text(invoice.clientEmail, 40, y);
    y += 16;
  }

  if (invoice.clientPhone) {
    doc.text(invoice.clientPhone, 40, y);
    y += 16;
  }

  if (invoice.clientAddress) {
    const lines = doc.splitTextToSize(invoice.clientAddress, 220);
    doc.text(lines, 40, y);
    y += lines.length * 16;
  }

  y += 20;

  // Description section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Description of Work:", 40, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const descLines = doc.splitTextToSize(
    invoice.description || "Professional landscaping services",
    W - 100
  );
  doc.text(descLines, 40, y);
  y += descLines.length * 16 + 10;

  // Materials (if any)
  if (invoice.materials) {
    doc.setFont("helvetica", "bold");
    doc.text("Materials:", 40, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    const matLines = doc.splitTextToSize(invoice.materials, W - 100);
    doc.text(matLines, 40, y);
    y += matLines.length * 16 + 10;
  }

  // ── Pricing table — full width ──────────────────────────────
  y += 20;
  const subtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
  const tax = parseFloat(invoice.tax || 0);

  // Collect billable expenses from invoice stored data or passed expenses array
  const billableExpenses = expenses.filter(e => e.billableToClient === true);
  const billableMaterialsTotal = billableExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const total = subtotal + billableMaterialsTotal + tax;

  const TBL_LEFT  = 40;
  const TBL_RIGHT = W - 40;
  const TBL_WIDTH = TBL_RIGHT - TBL_LEFT;
  const AMT_X     = TBL_RIGHT;
  const LBL_X     = TBL_LEFT + 8;
  const LBL_MAX   = TBL_WIDTH - 90;

  // Header row
  doc.setDrawColor(60);
  doc.setFillColor(240, 240, 240);
  doc.rect(TBL_LEFT, y, TBL_WIDTH, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Item", LBL_X, y + 16);
  doc.text("Amount", AMT_X, y + 16, { align: "right" });
  y += 28;

  // Labor / Services row
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(200);
  doc.text("Labor / Services", LBL_X, y + 14);
  doc.text(`$${subtotal.toFixed(2)}`, AMT_X, y + 14, { align: "right" });
  doc.line(TBL_LEFT, y + 20, TBL_RIGHT, y + 20);
  y += 24;

  // Billable materials rows
  if (billableExpenses.length > 0) {
    billableExpenses.forEach((exp) => {
      const vendorPart = exp.vendor || "Materials";
      const descPart = exp.description ? ` — ${exp.description.substring(0, 60)}` : '';
      const label = `${vendorPart}${descPart}`;
      const labelLines = doc.splitTextToSize(label, LBL_MAX);
      const rowH = labelLines.length * 13 + 10;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0);
      doc.text(labelLines, LBL_X, y + 14);
      doc.text(`$${parseFloat(exp.amount || 0).toFixed(2)}`, AMT_X, y + 14, { align: "right" });
      doc.setDrawColor(200);
      doc.line(TBL_LEFT, y + rowH, TBL_RIGHT, y + rowH);
      y += rowH;
    });
    if (billableExpenses.length > 1) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      doc.text("Materials Subtotal", LBL_X, y + 14);
      doc.text(`$${billableMaterialsTotal.toFixed(2)}`, AMT_X, y + 14, { align: "right" });
      doc.setTextColor(0);
      doc.setDrawColor(150);
      doc.line(TBL_LEFT, y + 20, TBL_RIGHT, y + 20);
      y += 24;
    }
  }

  // Tax row
  if (tax > 0) {
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(200);
    const taxLabel = invoice.taxRate ? `Tax (${invoice.taxRate}%)` : "Tax";
    doc.text(taxLabel, LBL_X, y + 14);
    doc.text(`$${tax.toFixed(2)}`, AMT_X, y + 14, { align: "right" });
    doc.line(TBL_LEFT, y + 20, TBL_RIGHT, y + 20);
    y += 24;
  }

  // Total row — full width blue bar
  doc.setFillColor(21, 101, 192);
  doc.rect(TBL_LEFT, y, TBL_WIDTH, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL DUE", LBL_X, y + 18);
  doc.text(`$${total.toFixed(2)}`, AMT_X, y + 18, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(60);
  y += 36;

  // Payment summary — show if payments have been made
  const totalPaid = parseFloat(invoice._totalPaid || invoice.totalPaid || 0);
  // Always calculate dynamically — stored remainingBalance may be stale
  const remainingBalance = Math.max(0, total - totalPaid);
  if (totalPaid > 0) {
    y += 12;
    const isPaidFull = remainingBalance <= 0;
    const pmtBoxH = 50;
    // If payment box won't fit on current page, start new page
    if (y + pmtBoxH + 20 > H - 100) {
      doc.addPage();
      y = 60;
    }
    // Light shaded payment summary box
    doc.setFillColor(isPaidFull ? 232 : 255, isPaidFull ? 245 : 243, isPaidFull ? 233 : 224);
    doc.setDrawColor(isPaidFull ? 76 : 230, isPaidFull ? 175 : 126, isPaidFull ? 80 : 0);
    doc.setLineWidth(0.5);
    doc.roundedRect(TBL_LEFT, y, TBL_WIDTH, pmtBoxH, 3, 3, "FD");
    // Payment received line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(46, 125, 50);
    doc.text("Payment Received:", LBL_X + 4, y + 16);
    doc.text(`-$${totalPaid.toFixed(2)}`, AMT_X - 4, y + 16, { align: "right" });
    // Divider
    doc.setDrawColor(200);
    doc.line(TBL_LEFT + 4, y + 25, TBL_RIGHT - 4, y + 25);
    // Balance due line
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(isPaidFull ? 46 : 180, isPaidFull ? 125 : 0, isPaidFull ? 50 : 0);
    doc.text(isPaidFull ? "✓ PAID IN FULL" : "Balance Due:", LBL_X + 4, y + 40);
    if (!isPaidFull) {
      doc.text(`$${remainingBalance.toFixed(2)}`, AMT_X - 4, y + 40, { align: "right" });
    }
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(60);
    y += pmtBoxH + 8;
  }

  if (invoice.status) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Status: ${invoice.status.toUpperCase()}`, LBL_X, y + 4);
    doc.setTextColor(0);
    y += 16;
  }

  if (invoice.notes) {
    y += 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Payment Instructions:", 40, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const notesLines = doc.splitTextToSize(invoice.notes, W - 100);
    doc.text(notesLines, 40, y);
    y += notesLines.length * 14;
  }

  // ── PAYMENT LINK + FOOTER ──
  if (invoice.id) {
    const payUrl = `${PAYMENT_BASE_URL}/${invoice.id}`;
    const boxH = 52;
    const footerH = 40; // space needed for footer below box
    const totalNeeded = boxH + footerH + 20;

    // If content is too close to bottom, push to new page
    if (y + totalNeeded > H - 40) {
      doc.addPage();
      y = 60;
    } else {
      y += 20; // small gap between content and box
    }

    const boxY = y;

    // Shaded background box
    doc.setFillColor(240, 247, 255);
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(1);
    doc.roundedRect(40, boxY, W - 80, boxH, 4, 4, "FD");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(21, 101, 192);
    doc.text(">> Pay Online:", 52, boxY + 18);

    // Clickable URL
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(21, 101, 192);
    doc.textWithLink(payUrl, 52, boxY + 36, { url: payUrl });

    // Underline the link manually
    const linkWidth = doc.getTextWidth(payUrl);
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(0.5);
    doc.line(52, boxY + 38, 52 + linkWidth, boxY + 38);

    // Reset colors
    doc.setTextColor(0);
    doc.setDrawColor(60);

    y = boxY + boxH + 16;
  }

  // Footer — always at bottom of current page
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Thank you for your business!", W / 2, H - 36, { align: "center" });

  // ============================================
  // PAGE 2: MATERIAL BREAKDOWN (Optional)
  // ============================================

  if (includeMaterialBreakdown && expenses.length > 0) {
    doc.addPage();

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(COMPANY.name, W / 2, 60, { align: "center" });

    doc.setFontSize(16);
    doc.text("MATERIAL COST BREAKDOWN", W / 2, 85, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Invoice No.: ${invoiceNum}`, W / 2, 105, { align: "center" });
    doc.text(`Client: ${invoice.clientName || 'N/A'}`, W / 2, 120, { align: "center" });

    let materialY = 150;

    doc.setTextColor(0);
    doc.setFontSize(11);
    const introText = doc.splitTextToSize(
      "Below is a detailed breakdown of actual material costs incurred for your project. " +
      "These represent our actual expenses from vendors. The invoice total includes these " +
      "materials plus labor, equipment, and other project costs.",
      W - 100
    );
    doc.text(introText, 50, materialY);
    materialY += introText.length * 16 + 20;

    const materialExpenses = expenses.filter(e =>
      e.category === 'materials' || e.category === 'supplies'
    );

    if (materialExpenses.length > 0) {
      const tableData = materialExpenses
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(expense => [
          new Date(expense.date).toLocaleDateString(),
          expense.vendor || '',
          expense.description || '',
          `$${parseFloat(expense.amount || 0).toFixed(2)}`,
        ]);

      autoTable(doc, {
        startY: materialY,
        head: [['Date', 'Vendor', 'Description', 'Amount']],
        body: tableData,
        foot: [[
          '', '',
          'Total Material Costs:',
          `$${materialExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0).toFixed(2)}`
        ]],
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], fontStyle: 'bold' },
        footStyles: { fillColor: [52, 73, 94], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 120 },
          2: { cellWidth: 240 },
          3: { cellWidth: 80, halign: 'right' },
        },
        margin: { left: 40, right: 40 },
      });

      materialY = doc.lastAutoTable.finalY + 30;

      const itemizedExpenses = materialExpenses.filter(e =>
        e.lineItems && e.lineItems.length > 0
      );

      if (itemizedExpenses.length > 0) {
        if (materialY > H - 200) {
          doc.addPage();
          materialY = 60;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("ITEMIZED RECEIPT DETAILS", 50, materialY);
        materialY += 20;

        itemizedExpenses.forEach(expense => {
          if (materialY > H - 150) {
            doc.addPage();
            materialY = 60;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text(
            `${expense.vendor} - ${new Date(expense.date).toLocaleDateString()}`,
            50, materialY
          );
          materialY += 15;

          const itemData = expense.lineItems.map(item => [
            item.item || '',
            item.quantity || '1',
            `$${parseFloat(item.price || 0).toFixed(2)}`,
            `$${(parseFloat(item.quantity || 1) * parseFloat(item.price || 0)).toFixed(2)}`,
          ]);

          autoTable(doc, {
            startY: materialY,
            head: [['Item', 'Qty', 'Unit Price', 'Total']],
            body: itemData,
            foot: [['', '', 'Receipt Total:', `$${parseFloat(expense.amount || 0).toFixed(2)}`]],
            theme: 'plain',
            headStyles: { fillColor: [189, 195, 199] },
            footStyles: { fontStyle: 'bold' },
            margin: { left: 70 },
            columnStyles: {
              0: { cellWidth: 280 },
              1: { cellWidth: 50, halign: 'center' },
              2: { cellWidth: 80, halign: 'right' },
              3: { cellWidth: 80, halign: 'right' },
            },
          });

          materialY = doc.lastAutoTable.finalY + 20;
        });
      }
    }

    doc.setFontSize(9);
    doc.setTextColor(100);
    const footerNote = "All costs listed are actual vendor charges. Invoice total includes materials, labor, equipment, and overhead.";
    const footerLines = doc.splitTextToSize(footerNote, W - 100);
    doc.text(footerLines, W / 2, H - 80, { align: "center" });
  }

  return doc;
}