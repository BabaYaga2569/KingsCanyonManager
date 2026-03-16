import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 296-0217",
  email: "kingscanyon775@gmail.com",
};

const PAYMENT_BASE_URL = "https://kcl-manager-test.web.app/public/pay";

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
  doc.rect(28, 28, W - 56, H - 56);

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

  // Amount table
  y += 20;
  const subtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
  const tax = parseFloat(invoice.tax || 0);
  const total = subtotal + tax;

  const tableX = W - 280;
  const colWidth = 120;

  doc.setDrawColor(200);
  doc.setLineWidth(0.5);

  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", tableX, y);
  doc.text(`$${subtotal.toFixed(2)}`, tableX + colWidth, y, { align: "right" });
  y += 20;

  if (tax > 0) {
    const taxLabel = invoice.taxRate ? `Tax (${invoice.taxRate}%):` : "Tax:";
    doc.text(taxLabel, tableX, y);
    doc.text(`$${tax.toFixed(2)}`, tableX + colWidth, y, { align: "right" });
    y += 20;
  }

  doc.line(tableX, y - 5, tableX + colWidth + 10, y - 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("TOTAL:", tableX, y + 4);
  doc.text(`$${total.toFixed(2)}`, tableX + colWidth, y + 4, { align: "right" });
  y += 30;

  if (invoice.status) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Status: ${invoice.status.toUpperCase()}`, tableX, y);
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

  // ── PAYMENT LINK SECTION ──
  if (invoice.id) {
    const payUrl = `${PAYMENT_BASE_URL}/${invoice.id}`;
    const boxY = H - 130;
    const boxH = 52;

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
  }

  // Footer
  const footerY = H - 56;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Thank you for your business!", W / 2, footerY, { align: "center" });

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