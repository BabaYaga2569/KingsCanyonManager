import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Box,
  MenuItem,
  Paper,
  Divider,
  Grid,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Alert,
  Card,
  CardContent,
  Chip,
} from "@mui/material";
import Swal from "sweetalert2";
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EmailIcon from '@mui/icons-material/Email';
import moment from 'moment';
import jsPDF from "jspdf";
import { sendInvoiceEmail } from "./emailService";

const InvoiceEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Separate state for tax rate
  const [taxRate, setTaxRate] = useState(0);
  
  // Logo for PDF
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  
  // NEW: Expense tracking state
  const [expenses, setExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [includeMaterialBreakdown, setIncludeMaterialBreakdown] = useState(false);
  
  // NEW: Payment plan state
  const [paymentPlanEnabled, setPaymentPlanEnabled] = useState(false);
  const [paymentFrequency, setPaymentFrequency] = useState('monthly');
  const [numberOfPayments, setNumberOfPayments] = useState(4);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [firstPaymentDate, setFirstPaymentDate] = useState(moment().format('YYYY-MM-DD'));

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const docRef = doc(db, "invoices", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          
          // Set invoice date - use existing or default to createdAt or today
          let invoiceDate = data.invoiceDate;
          if (!invoiceDate && data.createdAt) {
            // Convert Firestore timestamp to date string
            invoiceDate = moment(data.createdAt.toDate()).format("YYYY-MM-DD");
          } else if (!invoiceDate) {
            invoiceDate = moment().format("YYYY-MM-DD");
          }
          
          // Set payment date if it exists
          let paymentDate = data.paymentDate;
          if (!paymentDate && data.status === "Paid") {
            // Default to today if marked as paid but no date
            paymentDate = moment().format("YYYY-MM-DD");
          }
          
          setInvoice({ 
            ...data, 
            originalStatus: data.status,
            invoiceDate,
            paymentDate: paymentDate || "",
          }); // Store original status
          // Set tax rate if it exists
          if (data.taxRate) {
            setTaxRate(data.taxRate);
          }
          // Set material breakdown preference if it exists
          if (data.includeMaterialBreakdown !== undefined) {
            setIncludeMaterialBreakdown(data.includeMaterialBreakdown);
          }
          // Load payment plan if it exists
          if (data.paymentPlan && data.paymentPlan.enabled) {
            setPaymentPlanEnabled(true);
            setPaymentFrequency(data.paymentPlan.frequency || 'monthly');
            setNumberOfPayments(data.paymentPlan.numberOfPayments || 4);
            setDownPaymentPercent(data.paymentPlan.downPaymentPercent || 20);
            setFirstPaymentDate(data.paymentPlan.firstPaymentDate || moment().format('YYYY-MM-DD'));
          }
        } else {
          Swal.fire("Not found", "Invoice not found.", "error");
          navigate("/invoices");
        }
      } catch (e) {
        Swal.fire("Error", "Failed to load invoice.", "error");
        navigate("/invoices");
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [id, navigate]);

  // Auto-populate client info from customers collection if missing
  useEffect(() => {
    const populateClientInfo = async () => {
      if (!invoice) return;
      
      // First, check if data exists under alternate field names (customerEmail vs clientEmail)
      const currentEmail = invoice.clientEmail || invoice.customerEmail || "";
      const currentPhone = invoice.clientPhone || invoice.customerPhone || "";
      const currentAddress = invoice.clientAddress || invoice.customerAddress || "";
      
      // If we already have all info (under either naming), just normalize to client* fields
      if (currentEmail && currentPhone && currentAddress) {
        if (!invoice.clientEmail || !invoice.clientPhone || !invoice.clientAddress) {
          setInvoice(prev => ({
            ...prev,
            clientEmail: currentEmail,
            clientPhone: currentPhone,
            clientAddress: currentAddress,
          }));
        }
        return;
      }
      
      try {
        let customerData = null;
        
        // Try by customerId first
        if (invoice.customerId) {
          const customerDoc = await getDoc(doc(db, "customers", invoice.customerId));
          if (customerDoc.exists()) {
            customerData = customerDoc.data();
          }
        }
        
        // Fallback: search by name
        if (!customerData && invoice.clientName) {
          const q = query(collection(db, "customers"), where("name", "==", invoice.clientName));
          const snap = await getDocs(q);
          if (!snap.empty) {
            customerData = snap.docs[0].data();
            // Save the customerId for future lookups
            try {
              await updateDoc(doc(db, "invoices", id), { customerId: snap.docs[0].id });
            } catch (e) {
              console.error("Error saving customerId:", e);
            }
          }
        }
        
        if (customerData) {
          const updates = {};
          if (!currentEmail && customerData.email) updates.clientEmail = customerData.email;
          if (!currentPhone && customerData.phone) updates.clientPhone = customerData.phone;
          if (!currentAddress) {
            const addr = [customerData.address, customerData.city, customerData.state, customerData.zip]
              .filter(Boolean).join(", ");
            if (addr) updates.clientAddress = addr;
          }
          
          if (Object.keys(updates).length > 0) {
            setInvoice(prev => ({ ...prev, ...updates }));
            // Save to invoice so it persists
            try {
              await updateDoc(doc(db, "invoices", id), updates);
              console.log("✅ Auto-populated client info from customer record");
            } catch (e) {
              console.error("Error saving client info:", e);
            }
          }
        }
      } catch (err) {
        console.error("Error looking up customer:", err);
      }
    };
    
    populateClientInfo();
  }, [invoice?.clientName, invoice?.customerId]);

  // NEW: Load expenses for this job
  useEffect(() => {
    const fetchExpenses = async () => {
      if (!invoice || !invoice.jobId) return;
      
      setLoadingExpenses(true);
      try {
        const expensesSnap = await getDocs(collection(db, "expenses"));
        const jobExpenses = expensesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => e.jobId === invoice.jobId);
        setExpenses(jobExpenses);
      } catch (error) {
        console.error("Error loading expenses:", error);
      } finally {
        setLoadingExpenses(false);
      }
    };
    
    if (invoice) {
      fetchExpenses();
    }
  }, [invoice?.jobId]);

  const COMPANY = {
    name: "Kings Canyon Landscaping LLC",
    cityState: "Bullhead City, AZ",
    phone: "(928) 450-5733",
    email: "kingscanyon775@gmail.com",
    logoPath: "/logo-kcl.png",
  };

  // Preload logo for PDF
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        setLogoDataUrl(c.toDataURL("image/png"));
      } catch (e) {
        console.error("Logo loading error:", e);
      }
    };
    img.onerror = () => setLogoDataUrl(null);
    img.src = COMPANY.logoPath;
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInvoice({ ...invoice, [name]: value });
  };

  // Calculate tax when subtotal or tax rate changes
  useEffect(() => {
    if (invoice && invoice.subtotal !== undefined) {
      const subtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
      const calculatedTax = (subtotal * taxRate) / 100;
      
      setInvoice(prev => ({
        ...prev,
        tax: calculatedTax,
        taxRate: taxRate,
      }));
    }
  }, [taxRate, invoice?.subtotal]);

  const handleTaxRateChange = (e) => {
    const rate = parseFloat(e.target.value) || 0;
    setTaxRate(rate);
  };

  // NEW: Calculate payment schedule
  const calculatePaymentSchedule = () => {
    if (!invoice) return [];
    
    const totalAmount = parseFloat(invoice.subtotal || invoice.amount || 0) + parseFloat(invoice.tax || 0);
    const downPayment = (totalAmount * downPaymentPercent) / 100;
    const remaining = totalAmount - downPayment;
    const installmentAmount = remaining / (numberOfPayments - 1);
    
    const schedule = [];
    
    // Add down payment
    schedule.push({
      amount: downPayment,
      dueDate: firstPaymentDate,
      paymentNumber: 1,
      type: 'down_payment',
    });
    
    // Add installments
    for (let i = 1; i < numberOfPayments; i++) {
      let dueDate = moment(firstPaymentDate);
      
      switch (paymentFrequency) {
        case 'weekly':
          dueDate = dueDate.add(i * 7, 'days');
          break;
        case 'biweekly':
          dueDate = dueDate.add(i * 14, 'days');
          break;
        case 'monthly':
          dueDate = dueDate.add(i, 'months');
          break;
        default:
          dueDate = dueDate.add(i, 'months');
      }
      
      // Last payment gets remaining (handles rounding)
      const isLast = i === numberOfPayments - 1;
      const amount = isLast 
        ? remaining - (installmentAmount * (numberOfPayments - 2))
        : installmentAmount;
      
      schedule.push({
        amount: amount,
        dueDate: dueDate.format('YYYY-MM-DD'),
        paymentNumber: i + 1,
        type: 'installment',
      });
    }
    
    return schedule;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, "invoices", id);
      
      // Recalculate total when saving
      const subtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
      const tax = parseFloat(invoice.tax || 0);
      const total = subtotal + tax;
      
      // Build payment plan object
      const paymentPlan = paymentPlanEnabled ? {
        enabled: true,
        frequency: paymentFrequency,
        numberOfPayments: numberOfPayments,
        downPaymentPercent: downPaymentPercent,
        downPayment: (total * downPaymentPercent) / 100,
        installmentAmount: (total - (total * downPaymentPercent) / 100) / (numberOfPayments - 1),
        firstPaymentDate: firstPaymentDate,
        schedule: calculatePaymentSchedule(),
        createdAt: new Date().toISOString(),
      } : { enabled: false };
      
      // ✅ NEW: Auto-handle when marking invoice as "Paid"
      const statusChanged = invoice.status === "Paid" && invoice.status !== invoice.originalStatus;
      
      if (statusChanged) {
        // Check if payment record already exists
        const paymentsQuery = query(
          collection(db, "payments"),
          where("invoiceId", "==", id)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        
        // If no payment records exist, create one for tax reporting
        if (paymentsSnap.empty) {
          await addDoc(collection(db, "payments"), {
            invoiceId: id,
            clientName: invoice.clientName,
            amount: total,
            paymentMethod: "other",
            paymentDate: invoice.paymentDate || moment().format("YYYY-MM-DD"),
            reference: "Auto-generated from invoice status",
            notes: "Automatically created when invoice marked as Paid",
            receiptGenerated: false,
            createdAt: new Date().toISOString(),
          });
          
          console.log("✅ Auto-created payment record for tax reporting");
        } else {
          // Payment record exists, update it with the new payment date
          const paymentDoc = paymentsSnap.docs[0];
          await updateDoc(doc(db, "payments", paymentDoc.id), {
            paymentDate: invoice.paymentDate || moment().format("YYYY-MM-DD"),
            amount: total,
          });
          console.log("✅ Updated existing payment record with new date");
        }
        
        // ✅ Auto-complete the related job if it exists
        if (invoice.jobId) {
          try {
            const jobRef = doc(db, "jobs", invoice.jobId);
            const jobSnap = await getDoc(jobRef);
            
            if (jobSnap.exists()) {
              await updateDoc(jobRef, {
                status: "Completed",
                completedDate: new Date().toISOString(),
              });
              console.log("✅ Auto-completed related job");
            }
          } catch (jobError) {
            console.warn("Could not auto-complete job:", jobError);
            // Continue anyway - invoice update is more important
          }
        }
      }
      
      // ✅ UPDATE: Also update payment date for invoices that are already "Paid" (not just newly marked)
      if (invoice.status === "Paid" && invoice.paymentDate && !statusChanged) {
        try {
          const paymentsQuery = query(
            collection(db, "payments"),
            where("invoiceId", "==", id)
          );
          const paymentsSnap = await getDocs(paymentsQuery);
          
          if (!paymentsSnap.empty) {
            const paymentDoc = paymentsSnap.docs[0];
            await updateDoc(doc(db, "payments", paymentDoc.id), {
              paymentDate: invoice.paymentDate,
              amount: total,
            });
            console.log("✅ Updated payment date for existing Paid invoice");
          }
        } catch (paymentError) {
          console.error("Error updating payment date:", paymentError);
          // Don't fail the whole save if payment update fails
        }
      }
      
      await updateDoc(docRef, {
        ...invoice,
        subtotal,
        tax,
        total,
        taxRate,
        includeMaterialBreakdown, // Save material breakdown preference
        paymentPlan, // NEW: Save payment plan
        totalPaid: invoice.status === "Paid" ? total : (invoice.totalPaid || 0),
        remainingBalance: invoice.status === "Paid" ? 0 : (invoice.remainingBalance || total),
        paymentStatus: invoice.status === "Paid" ? "paid" : (invoice.paymentStatus || "unpaid"),
      });
      
      Swal.fire("Saved", "Invoice updated successfully.", "success");
    } catch (e) {
      console.error("Error saving invoice:", e);
      Swal.fire("Error", "Failed to save changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  // helper for PDF text wrapping
  const writeParagraph = (pdfDoc, text, x, yStart, maxWidth) => {
    const lines = pdfDoc.splitTextToSize(text, maxWidth);
    pdfDoc.text(lines, x, yStart);
    return yStart + lines.length * 12;
  };

  // Build Invoice PDF
  const buildInvoicePDF = () => {
    if (!invoice) return null;

    const docPDF = new jsPDF({ unit: "pt", format: "letter" });
    const W = docPDF.internal.pageSize.getWidth();
    const H = docPDF.internal.pageSize.getHeight();

    const invoiceSubtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
    const invoiceTax = parseFloat(invoice.tax || 0);
    const invoiceTotal = invoiceSubtotal + invoiceTax;

    // Frame
    docPDF.setDrawColor(60);
    docPDF.setLineWidth(1);
    docPDF.rect(28, 28, W - 56, H - 56);

    // Logo
    if (logoDataUrl) {
      try {
        docPDF.addImage(logoDataUrl, "PNG", 40, 42, 60, 60);
      } catch (e) {
        console.error("Error adding logo:", e);
      }
    }

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
    docPDF.setFontSize(18);
    docPDF.text("INVOICE", W - 40, 55, { align: "right" });

    // Invoice meta
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text(`Invoice No.: ${id.slice(-8)}`, W - 40, 75, { align: "right" });
    docPDF.text(`Date: ${invoice.invoiceDate || new Date().toLocaleDateString()}`, W - 40, 89, { align: "right" });
    if (invoice.status) {
      docPDF.text(`Status: ${invoice.status}`, W - 40, 103, { align: "right" });
    }

    // Divider
    docPDF.setDrawColor(150);
    docPDF.line(40, 115, W - 40, 115);

    // Bill To
    let y = 135;
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Bill To:", 40, y);
    y += 16;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text(invoice.clientName || "N/A", 40, y);
    y += 14;
    if (invoice.clientAddress) {
      const addrLines = docPDF.splitTextToSize(invoice.clientAddress, 250);
      docPDF.text(addrLines, 40, y);
      y += addrLines.length * 12;
    }
    if (invoice.clientEmail) {
      docPDF.text(invoice.clientEmail, 40, y);
      y += 14;
    }
    if (invoice.clientPhone) {
      docPDF.text(invoice.clientPhone, 40, y);
      y += 14;
    }

    y += 16;

    // Description
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Description of Work", 40, y);
    y += 14;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    const desc = docPDF.splitTextToSize(invoice.description || "Landscaping services", W - 80);
    docPDF.text(desc, 40, y);
    y += desc.length * 12 + 14;

    // Materials
    if (invoice.materials) {
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Materials", 40, y);
      y += 14;
      docPDF.setFont("helvetica", "normal");
      docPDF.setFontSize(10);
      const mats = docPDF.splitTextToSize(invoice.materials, W - 80);
      docPDF.text(mats, 40, y);
      y += mats.length * 12 + 14;
    }

    // Pricing table
    y += 10;
    docPDF.setDrawColor(60);
    docPDF.setFillColor(240, 240, 240);
    docPDF.rect(W - 280, y, 240, 24, "F");
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(10);
    docPDF.text("Item", W - 270, y + 16);
    docPDF.text("Amount", W - 60, y + 16, { align: "right" });
    y += 28;

    // Subtotal row
    docPDF.setFont("helvetica", "normal");
    docPDF.text("Subtotal", W - 270, y + 14);
    docPDF.text(`$${invoiceSubtotal.toFixed(2)}`, W - 60, y + 14, { align: "right" });
    docPDF.line(W - 280, y + 20, W - 40, y + 20);
    y += 24;

    // Tax row
    if (invoiceTax > 0) {
      docPDF.text(`Tax (${taxRate}%)`, W - 270, y + 14);
      docPDF.text(`$${invoiceTax.toFixed(2)}`, W - 60, y + 14, { align: "right" });
      docPDF.line(W - 280, y + 20, W - 40, y + 20);
      y += 24;
    }

    // Total row
    docPDF.setFillColor(21, 101, 192);
    docPDF.rect(W - 280, y, 240, 28, "F");
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(12);
    docPDF.setTextColor(255, 255, 255);
    docPDF.text("TOTAL", W - 270, y + 18);
    docPDF.text(`$${invoiceTotal.toFixed(2)}`, W - 60, y + 18, { align: "right" });
    docPDF.setTextColor(0, 0, 0);
    y += 40;

    // Payment plan summary
    if (paymentPlanEnabled) {
      y += 10;
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Payment Schedule", 40, y);
      y += 16;
      docPDF.setFont("helvetica", "normal");
      docPDF.setFontSize(10);

      const schedule = calculatePaymentSchedule();
      schedule.forEach((payment, idx) => {
        const label = idx === 0 ? "Down Payment" : `Payment #${idx + 1}`;
        const date = moment(payment.dueDate).format("MMM DD, YYYY");
        docPDF.text(`${label}: $${payment.amount.toFixed(2)} — Due ${date}`, 50, y);
        y += 14;
      });
      y += 10;
    }

    // Payment info
    y += 10;
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Payment Options", 40, y);
    y += 16;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text("Zelle: 928-450-5733", 50, y);
    y += 14;
    docPDF.text("Cash or Check accepted on-site", 50, y);
    y += 14;

    // Notes
    if (invoice.notes) {
      y += 10;
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Notes", 40, y);
      y += 14;
      docPDF.setFont("helvetica", "normal");
      docPDF.setFontSize(10);
      const notes = docPDF.splitTextToSize(invoice.notes, W - 80);
      docPDF.text(notes, 40, y);
    }

    // Footer
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(
      "Thank you for choosing Kings Canyon Landscaping. We appreciate your business.",
      W / 2, H - 36, { align: "center" }
    );

    return docPDF;
  };

  // Download Invoice PDF
  const handleGeneratePDF = () => {
    try {
      const docPDF = buildInvoicePDF();
      if (!docPDF) return;

      const filenameSafe = (invoice.clientName || "Invoice").replace(/[^\w\- ]+/g, "_").replace(/\s+/g, "_");
      const filename = `${filenameSafe}_Invoice_${id.slice(-8)}.pdf`;
      docPDF.save(filename);

      Swal.fire({
        icon: "success",
        title: "PDF Downloaded!",
        text: `Invoice saved as ${filename}`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      Swal.fire("Error", "Failed to generate PDF.", "error");
    }
  };

  // ✅ EMAIL INVOICE TO CUSTOMER
  const handleEmailToCustomer = async () => {
    let emailToSend = invoice.clientEmail || invoice.customerEmail || "";
    
    if (!emailToSend) {
      const { value: enteredEmail } = await Swal.fire({
        title: 'Customer Email',
        input: 'email',
        inputLabel: `Enter email for ${invoice.clientName}`,
        inputPlaceholder: 'customer@email.com',
        showCancelButton: true,
        confirmButtonText: 'Send',
        validationMessage: 'Please enter a valid email address',
      });
      
      if (!enteredEmail) return;
      emailToSend = enteredEmail;
      
      // Save email to invoice
      setInvoice({ ...invoice, clientEmail: enteredEmail });
      try {
        await updateDoc(doc(db, "invoices", id), { clientEmail: enteredEmail });
      } catch (e) {
        console.error("Error saving client email:", e);
      }
    }
    
    const invoiceTotal = parseFloat(invoice.subtotal || invoice.amount || 0) + parseFloat(invoice.tax || 0);
    
    const confirm = await Swal.fire({
      title: 'Email Invoice',
      html: `Send invoice PDF ($${invoiceTotal.toFixed(2)}) to:<br/><strong>${invoice.clientName}</strong><br/>${emailToSend}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Send Email',
      confirmButtonColor: '#1565c0',
    });
    
    if (!confirm.isConfirmed) return;
    
    setSending(true);
    try {
      const docPDF = buildInvoicePDF();
      if (!docPDF) throw new Error("Failed to generate PDF");
      
      const pdfBase64 = docPDF.output('datauristring').split(',')[1];
      
      await sendInvoiceEmail(
        emailToSend,
        invoice.clientName,
        { ...invoice, id, total: invoiceTotal },
        pdfBase64
      );
      
      // Update invoice status if Pending
      if (invoice.status === "Pending") {
        await updateDoc(doc(db, "invoices", id), {
          status: "Sent",
          emailSentAt: new Date().toISOString(),
          emailSentTo: emailToSend,
        });
        setInvoice({ ...invoice, status: "Sent" });
      } else {
        // Just log the email send
        await updateDoc(doc(db, "invoices", id), {
          emailSentAt: new Date().toISOString(),
          emailSentTo: emailToSend,
        });
      }
      
      Swal.fire({
        icon: 'success',
        title: 'Email Sent!',
        html: `Invoice sent to <strong>${emailToSend}</strong>`,
        timer: 3000,
        showConfirmButton: false,
      });
      
    } catch (error) {
      console.error("Error sending email:", error);
      Swal.fire({
        icon: 'error',
        title: 'Email Failed',
        text: error.message || 'Could not send email. Check Gmail settings.',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading invoice...
        </Typography>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6">No invoice data available.</Typography>
      </Container>
    );
  }

  const subtotal = parseFloat(invoice.subtotal || invoice.amount || 0);
  const tax = parseFloat(invoice.tax || 0);
  const total = subtotal + tax;
  
  // NEW: Calculate profit metrics
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const profit = total - totalExpenses;
  const profitMargin = total > 0 ? ((profit / total) * 100).toFixed(1) : 0;

  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h5" gutterBottom>
        Edit Invoice — {invoice.clientName || "Unnamed"}
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>📅 Tax Reporting:</strong> Use the Invoice Date and Payment Date fields below to ensure accurate tax reporting for the correct year.
      </Alert>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 900 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            📅 Invoice Date & Status
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Invoice Date"
              name="invoiceDate"
              type="date"
              value={invoice.invoiceDate || ""}
              onChange={handleChange}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              helperText="The date this invoice was issued (determines tax year)"
            />

            {paymentPlanEnabled && invoice.status !== "Making Payments" && invoice.status !== "Paid" && (
              <Alert severity="info">
                💡 <strong>Tip:</strong> Since you've enabled a payment plan, consider setting the status to "Making Payments" 
                to track that installments are in progress.
              </Alert>
            )}

            <TextField
              select
              label="Status"
              name="status"
              value={invoice.status || "Pending"}
              onChange={handleChange}
              fullWidth
              helperText="Update status as invoice progresses"
            >
              <MenuItem value="Pending">Pending - Not sent yet</MenuItem>
              <MenuItem value="Sent">Sent - Emailed to client</MenuItem>
              <MenuItem value="Making Payments">Making Payments - Installments in progress 💰</MenuItem>
              <MenuItem value="Paid">Paid - Payment received ✅</MenuItem>
              <MenuItem value="Overdue">Overdue - Payment late</MenuItem>
            </TextField>

            {invoice.status === "Paid" && (
              <TextField
                label="💰 Payment Received Date"
                name="paymentDate"
                type="date"
                value={invoice.paymentDate || ""}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                helperText="The date payment was actually received (for tax reporting)"
                sx={{
                  bgcolor: "#e8f5e9",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": {
                      borderColor: "success.main",
                    },
                  },
                }}
              />
            )}
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Client Information
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Client Name"
              name="clientName"
              value={invoice.clientName || ""}
              onChange={handleChange}
              fullWidth
              required
            />

            <TextField
              label="Client Email"
              name="clientEmail"
              type="email"
              value={invoice.clientEmail || ""}
              onChange={handleChange}
              fullWidth
              helperText="Email address for sending invoice"
            />

            <TextField
              label="Client Phone"
              name="clientPhone"
              value={invoice.clientPhone || ""}
              onChange={handleChange}
              fullWidth
              helperText="Contact phone number"
            />

            <TextField
              label="Client Address"
              name="clientAddress"
              multiline
              rows={2}
              value={invoice.clientAddress || ""}
              onChange={handleChange}
              fullWidth
              helperText="Billing address"
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Invoice Details
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Description"
              name="description"
              multiline
              rows={4}
              value={invoice.description || ""}
              onChange={handleChange}
              fullWidth
              helperText="Describe the work completed"
              required
            />

            <TextField
              label="Materials"
              name="materials"
              multiline
              rows={3}
              value={invoice.materials || ""}
              onChange={handleChange}
              fullWidth
              helperText="List materials used (will appear on invoice)"
            />

            <TextField
              label="Notes / Payment Instructions"
              name="notes"
              multiline
              rows={3}
              value={invoice.notes || ""}
              onChange={handleChange}
              fullWidth
              helperText="Payment terms, instructions, or special notes (will appear on invoice)"
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Pricing
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Subtotal"
              name="subtotal"
              type="number"
              value={invoice.subtotal || invoice.amount || ""}
              onChange={handleChange}
              fullWidth
              required
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              inputProps={{ min: 0, step: "0.01" }}
              helperText="Amount before tax"
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Tax Rate"
                  value={taxRate}
                  onChange={handleTaxRateChange}
                  fullWidth
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                  helperText="Select or enter tax rate for your area"
                >
                  <MenuItem value={0}>No Tax (0%)</MenuItem>
                  <MenuItem value={5}>5%</MenuItem>
                  <MenuItem value={5.6}>5.6% (Bullhead City, AZ)</MenuItem>
                  <MenuItem value={6}>6%</MenuItem>
                  <MenuItem value={7}>7%</MenuItem>
                  <MenuItem value={7.5}>7.5%</MenuItem>
                  <MenuItem value={8}>8%</MenuItem>
                  <MenuItem value={8.25}>8.25%</MenuItem>
                  <MenuItem value={8.5}>8.5%</MenuItem>
                  <MenuItem value={9}>9%</MenuItem>
                  <MenuItem value={10}>10%</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Tax Amount (Auto-calculated)"
                  value={`$${tax.toFixed(2)}`}
                  fullWidth
                  disabled
                  helperText={`${taxRate}% of $${subtotal.toFixed(2)}`}
                  InputProps={{
                    style: { fontWeight: 'bold' }
                  }}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, bgcolor: "#f5f5f5", borderRadius: 2 }}>
              <Typography variant="h6">Total Amount:</Typography>
              <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
                ${total.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* NEW: PROFIT ANALYSIS - Internal Only */}
        {expenses.length > 0 && (
          <Paper sx={{ p: 3, bgcolor: '#f0f7ff', border: '2px solid #2196f3' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TrendingUpIcon color="primary" />
              <Typography variant="h6" color="primary">
                💰 Profit Analysis (Internal - Not Shown to Client)
              </Typography>
            </Box>
            
            <Divider sx={{ mb: 2 }} />
            
            {loadingExpenses ? (
              <CircularProgress size={24} />
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Invoice Total (Revenue)
                    </Typography>
                    <Typography variant="h5" color="primary.main" fontWeight="bold">
                      ${total.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Your Costs (Expenses)
                    </Typography>
                    <Typography variant="h5" color="error.main" fontWeight="bold">
                      ${totalExpenses.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Your Profit
                    </Typography>
                    <Typography 
                      variant="h5" 
                      color={profit >= 0 ? "success.main" : "error.main"}
                      fontWeight="bold"
                    >
                      ${profit.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Profit Margin
                    </Typography>
                    <Typography 
                      variant="h4" 
                      color={profit >= 0 ? "success.main" : "error.main"}
                      fontWeight="bold"
                    >
                      {profitMargin}%
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    📊 Expense Breakdown:
                  </Typography>
                  {Object.entries(
                    expenses.reduce((acc, e) => {
                      const cat = e.category || 'other';
                      acc[cat] = (acc[cat] || 0) + parseFloat(e.amount || 0);
                      return acc;
                    }, {})
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <Box 
                        key={category}
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          p: 1,
                          mb: 0.5,
                          bgcolor: 'white',
                          borderRadius: 1
                        }}
                      >
                        <Typography sx={{ textTransform: 'capitalize' }}>
                          {category}:
                        </Typography>
                        <Typography fontWeight="bold" color="error.main">
                          ${amount.toFixed(2)}
                        </Typography>
                      </Box>
                    ))
                  }
                  
                  {invoice.jobId && (
                    <Button
                      size="small"
                      startIcon={<ReceiptLongIcon />}
                      onClick={() => navigate(`/job-expenses/${invoice.jobId}`)}
                      sx={{ mt: 2 }}
                      variant="outlined"
                      fullWidth
                    >
                      View All Expenses
                    </Button>
                  )}
                </Grid>
              </Grid>
            )}
          </Paper>
        )}

        {/* NEW: CLIENT MATERIAL BREAKDOWN OPTION */}
        {expenses.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ReceiptLongIcon />
              <Typography variant="h6">
                Client Options
              </Typography>
            </Box>
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeMaterialBreakdown}
                  onChange={(e) => setIncludeMaterialBreakdown(e.target.checked)}
                />
              }
              label="Include Material Cost Breakdown for Client (adds extra page to invoice PDF)"
            />
            
            {includeMaterialBreakdown && (
              <Alert severity="info" sx={{ mt: 2 }}>
                ✅ When generating the invoice PDF, an additional page will be included showing 
                itemized material costs from your expense receipts. This provides transparency 
                to clients who want to see actual material costs.
              </Alert>
            )}
          </Paper>
        )}

        {/* NEW: PAYMENT PLAN SETUP */}
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ScheduleIcon color="primary" />
            <Typography variant="h6">
              💰 Payment Plan Setup
            </Typography>
          </Box>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={paymentPlanEnabled}
                onChange={(e) => setPaymentPlanEnabled(e.target.checked)}
              />
            }
            label="Enable Payment Plan for this invoice"
          />
          
          {paymentPlanEnabled && (
            <Box sx={{ mt: 3, p: 3, bgcolor: '#f0f7ff', borderRadius: 2, border: '2px solid #2196f3' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    label="Payment Frequency"
                    value={paymentFrequency}
                    onChange={(e) => setPaymentFrequency(e.target.value)}
                    fullWidth
                    helperText="How often will customer pay?"
                  >
                    <MenuItem value="weekly">📅 Weekly - Every 7 days</MenuItem>
                    <MenuItem value="biweekly">📅 Bi-Weekly - Every 2 weeks</MenuItem>
                    <MenuItem value="monthly">📅 Monthly - Every month</MenuItem>
                  </TextField>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="number"
                    label="Number of Payments"
                    value={numberOfPayments}
                    onChange={(e) => setNumberOfPayments(parseInt(e.target.value) || 2)}
                    fullWidth
                    inputProps={{ min: 2, max: 12 }}
                    helperText="Total installments (including down payment)"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="number"
                    label="Down Payment %"
                    value={downPaymentPercent}
                    onChange={(e) => setDownPaymentPercent(parseFloat(e.target.value) || 10)}
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                    inputProps={{ min: 10, max: 50, step: 5 }}
                    helperText="Recommended: 10-20% based on payment frequency"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="First Payment Date (Down Payment)"
                    type="date"
                    value={firstPaymentDate}
                    onChange={(e) => setFirstPaymentDate(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="When is down payment due?"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ScheduleIcon /> Calculated Payment Schedule:
                  </Typography>
                  
                  <Alert severity="info" sx={{ mb: 2 }}>
                    💡 This schedule will be tracked in Payment Tracker after saving
                  </Alert>
                  
                  <Box sx={{ bgcolor: 'white', borderRadius: 1, overflow: 'hidden' }}>
                    <Grid container sx={{ p: 1, bgcolor: '#1976d2', color: 'white', fontWeight: 'bold' }}>
                      <Grid item xs={2}>#</Grid>
                      <Grid item xs={4}>Due Date</Grid>
                      <Grid item xs={3}>Amount</Grid>
                      <Grid item xs={3}>Type</Grid>
                    </Grid>
                    
                    {calculatePaymentSchedule().map((payment, idx) => (
                      <Grid 
                        container 
                        key={idx}
                        sx={{ 
                          p: 1,
                          borderBottom: '1px solid #e0e0e0',
                          '&:hover': { bgcolor: '#f5f5f5' }
                        }}
                      >
                        <Grid item xs={2}>
                          <Typography fontWeight="bold">#{idx + 1}</Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography>
                            {moment(payment.dueDate).format("MMM DD, YYYY")}
                          </Typography>
                        </Grid>
                        <Grid item xs={3}>
                          <Typography fontWeight="bold" color="primary">
                            ${payment.amount.toFixed(2)}
                          </Typography>
                        </Grid>
                        <Grid item xs={3}>
                          {idx === 0 ? (
                            <Chip label="Down Payment" color="warning" size="small" />
                          ) : (
                            <Chip label="Installment" color="info" size="small" />
                          )}
                        </Grid>
                      </Grid>
                    ))}
                    
                    <Grid 
                      container 
                      sx={{ 
                        p: 1.5,
                        bgcolor: '#e3f2fd',
                        fontWeight: 'bold'
                      }}
                    >
                      <Grid item xs={6}>
                        <Typography fontWeight="bold">Total:</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography fontWeight="bold" color="primary">
                          ${(subtotal + tax).toFixed(2)}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>

        {/* Email sent status */}
        {invoice.emailSentAt && (
          <Alert severity="success" icon={<EmailIcon />} sx={{ mt: 2 }}>
            Invoice emailed to <strong>{invoice.emailSentTo}</strong> on {new Date(invoice.emailSentAt).toLocaleString()}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2, mt: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button 
            variant="contained" 
            onClick={handleSave} 
            disabled={saving}
            sx={{ minWidth: 120 }}
            size="large"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button 
            variant="contained"
            color="success"
            onClick={handleEmailToCustomer}
            disabled={sending}
            size="large"
            startIcon={<EmailIcon />}
          >
            {sending ? "Sending..." : "Email to Customer"}
          </Button>
          <Button 
            variant="outlined"
            color="primary"
            onClick={handleGeneratePDF}
            size="large"
          >
            Download PDF
          </Button>
          <Button 
            variant="outlined" 
            color="inherit" 
            onClick={() => navigate("/invoices")}
            size="large"
          >
            Back to Invoices
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default InvoiceEditor;