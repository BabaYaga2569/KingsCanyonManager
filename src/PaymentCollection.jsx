import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { doc, getDoc, updateDoc, collection, addDoc } from "firebase/firestore";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Divider,
} from "@mui/material";
import QRCode from "qrcode";
import Swal from "sweetalert2";
import generateReceiptPDF from "./pdf/generateReceiptPDF";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  phone: "(928) 296-0217",
  zellePhone: "928-450-5733",
  email: "kingscanyon775@gmail.com",
  location: "Bullhead City, AZ",
};

export default function PaymentCollection() {
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get("invoiceId");
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [zelleQR, setZelleQR] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [checkAmount, setCheckAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      loadInvoice();
    }
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const docRef = doc(db, "invoices", invoiceId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setInvoice({ id: invoiceId, ...data });
        // Generate Zelle QR code
        generateZelleQR(data.total || data.amount || 0);
      } else {
        Swal.fire("Not Found", "Invoice not found.", "error");
        navigate("/invoices");
      }
    } catch (error) {
      console.error("Error loading invoice:", error);
      Swal.fire("Error", "Failed to load invoice.", "error");
    } finally {
      setLoading(false);
    }
  };

  const generateZelleQR = async (amount) => {
    try {
      // Create Zelle payment info text (QR will show this)
      const zelleInfo = `Zelle\nPay: ${COMPANY.zellePhone}\nAmount: $${amount.toFixed(2)}\nKings Canyon Landscaping`;
      const qrDataUrl = await QRCode.toDataURL(zelleInfo, {
        width: 300,
        margin: 2,
      });
      setZelleQR(qrDataUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  const handlePaymentMethod = (method) => {
    setSelectedMethod(method);
    if (method === "cash") {
      setCashAmount((invoice.total || invoice.amount || 0).toFixed(2));
    }
    if (method === "check") {
      setCheckAmount((invoice.total || invoice.amount || 0).toFixed(2));
    }
  };

  const recordPayment = async (paymentMethod, amount, details = {}) => {
    setProcessing(true);
    try {
      // Record payment in payments collection
      await addDoc(collection(db, "payments"), {
        invoiceId: invoice.id,
        contractId: invoice.contractId || "",
        jobId: invoice.jobId || "",
        customerName: invoice.clientName,
        customerId: invoice.customerId || null,
        amount: parseFloat(amount),
        paymentMethod,
        ...details,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Update invoice status to Paid
      await updateDoc(doc(db, "invoices", invoice.id), {
        status: "Paid",
        paidAt: new Date().toISOString(),
        paymentMethod,
      });

      // Generate receipt
      await generateReceipt(paymentMethod, amount);

      // Show success
      await Swal.fire({
        icon: "success",
        title: "Payment Received!",
        html: `
          <strong>$${parseFloat(amount).toFixed(2)}</strong> received via ${paymentMethod}<br>
          <br>
          Receipt generated!<br>
          Invoice marked as PAID ✅
        `,
        confirmButtonText: "Done",
      });

      navigate("/invoices");
    } catch (error) {
      console.error("Error recording payment:", error);
      Swal.fire("Error", "Failed to record payment. Please try again.", "error");
    } finally {
      setProcessing(false);
    }
  };

  const generateReceipt = async (paymentMethod, amount) => {
    try {
      // Load logo
      let logoDataUrl = null;
      try {
        const blob = await fetch("/logo-kcl.png").then((r) =>
          r.ok ? r.blob() : null
        );
        if (blob) {
          logoDataUrl = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
        }
      } catch (_) {}

      const receiptData = {
        ...invoice,
        logoDataUrl,
        paymentMethod,
        paidAmount: parseFloat(amount),
        paidAt: new Date().toLocaleString(),
      };

      const pdf = await generateReceiptPDF(receiptData);

      // Open receipt in new tab
      const pdfBlob = pdf.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, "_blank");
    } catch (error) {
      console.error("Error generating receipt:", error);
    }
  };

  const handleZelleConfirm = () => {
    Swal.fire({
      title: "Confirm Zelle Payment",
      text: "Has the customer completed the Zelle payment?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Payment Received",
      cancelButtonText: "Not Yet",
    }).then((result) => {
      if (result.isConfirmed) {
        recordPayment("Zelle", invoice.total || invoice.amount || 0);
      }
    });
  };

  const handleCashSubmit = () => {
    const amount = parseFloat(cashAmount);
    if (!amount || amount <= 0) {
      Swal.fire("Invalid Amount", "Please enter a valid amount.", "warning");
      return;
    }
    recordPayment("Cash", amount);
  };

  const handleCheckSubmit = () => {
    const amount = parseFloat(checkAmount);
    if (!amount || amount <= 0) {
      Swal.fire("Invalid Amount", "Please enter a valid amount.", "warning");
      return;
    }
    recordPayment("Check", amount, { checkNumber });
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading invoice...
        </Typography>
      </Box>
    );
  }

  if (!invoice) {
    return (
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <Typography variant="h6">Invoice not found.</Typography>
      </Box>
    );
  }

  const totalAmount = invoice.total || invoice.amount || 0;

  // Payment method selection screen
  if (!selectedMethod) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 },
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <Card
          sx={{
            maxWidth: 500,
            width: "100%",
            boxShadow: 5,
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
            <img
              src="/logo-kcl.png"
              alt="Kings Canyon Landscaping"
              style={{ height: 80, marginBottom: 16 }}
            />
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
              {COMPANY.name}
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Typography variant="h3" color="primary" sx={{ mb: 1, fontWeight: 700 }}>
              ${totalAmount.toFixed(2)}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              {invoice.clientName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {invoice.description}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 2 }}>
              Select Payment Method
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                onClick={() => handlePaymentMethod("zelle")}
                sx={{ py: 2, fontSize: "1.1rem" }}
              >
                💰 Zelle (FREE - Instant)
              </Button>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => handlePaymentMethod("cash")}
                sx={{ py: 2, fontSize: "1.1rem" }}
              >
                💵 Cash
              </Button>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => handlePaymentMethod("check")}
                sx={{ py: 2, fontSize: "1.1rem" }}
              >
                📝 Check
              </Button>

              <Button
                variant="text"
                onClick={() => navigate("/invoices")}
                sx={{ mt: 2 }}
              >
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Zelle payment screen
  if (selectedMethod === "zelle") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 },
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <Card sx={{ maxWidth: 500, width: "100%", boxShadow: 5 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
              Pay with Zelle
            </Typography>

            {zelleQR && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Scan this QR code with your phone camera:
                </Typography>
                <img
                  src={zelleQR}
                  alt="Zelle QR Code"
                  style={{ width: "100%", maxWidth: 300 }}
                />
              </Box>
            )}

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 1 }}>
              Or send manually:
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              <strong>Phone:</strong> {COMPANY.zellePhone}
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              <strong>Amount:</strong> ${totalAmount.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {invoice.clientName} - Invoice #{invoice.id.slice(-8)}
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 3 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                onClick={handleZelleConfirm}
                disabled={processing}
                sx={{ py: 2 }}
              >
                {processing ? <CircularProgress size={24} /> : "✅ Payment Received"}
              </Button>

              <Button
                variant="text"
                onClick={() => setSelectedMethod(null)}
                disabled={processing}
              >
                ← Back
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Cash payment screen
  if (selectedMethod === "cash") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 },
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <Card sx={{ maxWidth: 500, width: "100%", boxShadow: 5 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, textAlign: "center" }}>
              💵 Cash Payment
            </Typography>

            <Typography variant="h6" sx={{ mb: 2 }}>
              Invoice Amount: ${totalAmount.toFixed(2)}
            </Typography>

            <TextField
              label="Amount Received"
              type="number"
              fullWidth
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
              }}
              inputProps={{ step: "0.01", min: "0" }}
              sx={{ mb: 3 }}
            />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                onClick={handleCashSubmit}
                disabled={processing}
                sx={{ py: 2 }}
              >
                {processing ? <CircularProgress size={24} /> : "Record Payment"}
              </Button>

              <Button
                variant="text"
                onClick={() => setSelectedMethod(null)}
                disabled={processing}
              >
                ← Back
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Check payment screen
  if (selectedMethod === "check") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 },
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <Card sx={{ maxWidth: 500, width: "100%", boxShadow: 5 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, textAlign: "center" }}>
              📝 Check Payment
            </Typography>

            <Typography variant="h6" sx={{ mb: 2 }}>
              Invoice Amount: ${totalAmount.toFixed(2)}
            </Typography>

            <TextField
              label="Check Amount"
              type="number"
              fullWidth
              value={checkAmount}
              onChange={(e) => setCheckAmount(e.target.value)}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
              }}
              inputProps={{ step: "0.01", min: "0" }}
              sx={{ mb: 2 }}
            />

            <TextField
              label="Check Number (Optional)"
              fullWidth
              value={checkNumber}
              onChange={(e) => setCheckNumber(e.target.value)}
              sx={{ mb: 3 }}
            />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                onClick={handleCheckSubmit}
                disabled={processing}
                sx={{ py: 2 }}
              >
                {processing ? <CircularProgress size={24} /> : "Record Payment"}
              </Button>

              <Button
                variant="text"
                onClick={() => setSelectedMethod(null)}
                disabled={processing}
              >
                ← Back
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return null;
}