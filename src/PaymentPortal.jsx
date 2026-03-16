import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PaymentIcon from "@mui/icons-material/Payment";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Swal from "sweetalert2";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  owner: "Darren Bennett",
  phone: "928-450-5733",
  zelleDisplay: "928-450-5733",
  email: "kingscanyon775@gmail.com",
  address: "3091 Terrace View Dr, Laughlin, NV 89029",
  logoPath: "/logo-kcl.png",
};

export default function PaymentPortal() {
  const { invoiceId } = useParams();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    // Step 1: Load invoice — critical, show error if this fails
    let snap;
    try {
      snap = await getDoc(doc(db, "invoices", invoiceId));
      if (!snap.exists()) {
        Swal.fire("Not Found", "This payment link is invalid or expired.", "error");
        setLoading(false);
        return;
      }
      const data = snap.data();
      setInvoice({ id: snap.id, ...data });
      setLoading(false);
    } catch (error) {
      console.error("Error loading invoice:", error);
      Swal.fire("Error", "Failed to load payment information.", "error");
      setLoading(false);
      return;
    }

    // Step 2: Load payment history — non-critical, silently skip if it fails
    try {
      const paymentsQuery = query(collection(db, "payments"), where("invoiceId", "==", snap.id));
      const paymentsSnap = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      paymentsData.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
      setPayments(paymentsData);
    } catch (error) {
      // Payment history is optional — don't block the page if it fails
      console.warn("Could not load payment history:", error);
    }
  };

  const copyToClipboard = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleMarkAsPaid = async (paymentMethod, amount) => {
    const result = await Swal.fire({
      title: "Confirm Payment Sent",
      html: `
        <p>I have sent <strong>$${amount.toFixed(2)}</strong> via ${paymentMethod}.</p>
        <p style="font-size:0.9em;color:#666;">
          The business owner will verify this payment before marking your invoice paid.
        </p>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, I Sent It",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      Swal.fire({
        icon: "success",
        title: "Payment Confirmation Sent!",
        html: `
          <p>Thank you! We've been notified.</p>
          <p>You'll receive confirmation once payment is verified.</p>
          <p>Questions? Call ${COMPANY.phone}</p>
        `,
      });
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading payment information...</Typography>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">
          <Typography variant="h6">Payment Link Invalid</Typography>
          <Typography>This payment link is invalid or has expired.</Typography>
        </Alert>
      </Container>
    );
  }

  const totalAmount = parseFloat(invoice.total || invoice.amount || 0);
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const remainingBalance = totalAmount - totalPaid;
  const isPaidInFull = remainingBalance <= 0 || invoice.status === "Paid";
  const invoiceNum = invoiceId.slice(-8).toUpperCase();

  const isDepositPayment = totalPaid === 0;
  const depositAmount = invoice.depositAmount || totalAmount * 0.5;
  const currentPaymentAmount = isDepositPayment ? depositAmount : remainingBalance;

  const cardFee = +(remainingBalance * 0.035).toFixed(2);
  const cardTotal = +(remainingBalance + cardFee).toFixed(2);

  if (isPaidInFull) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, mb: 6 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleIcon sx={{ fontSize: 80, color: "success.main", mb: 2 }} />
          <Typography variant="h4" gutterBottom>Invoice Paid in Full!</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Total Paid: <strong>${totalPaid.toFixed(2)}</strong>
          </Typography>
          <Typography variant="body2">
            Thank you for your payment!<br />{COMPANY.name}<br />{COMPANY.phone}
          </Typography>
        </Paper>
      </Container>
    );
  }

  const paymentMethods = [
    {
      key: "zelle",
      emoji: "💸",
      label: "Zelle",
      badge: "FREE — No Fees!",
      badgeColor: "success",
      sublabel: "Instant & secure — recommended",
      color: "#6200ea",
      bg: "#f3e5f5",
    },
    {
      key: "card",
      emoji: "💳",
      label: "Credit / Debit Card",
      badge: `+$${cardFee} fee`,
      badgeColor: "warning",
      sublabel: `3.5% processing fee — Total: $${cardTotal.toFixed(2)}`,
      color: "#1565c0",
      bg: "#e3f2fd",
      disabled: true,
      disabledNote: "Coming soon",
    },
    {
      key: "applepay",
      emoji: "📱",
      label: "Apple Pay / Google Pay",
      badge: `+$${cardFee} fee`,
      badgeColor: "warning",
      sublabel: "3.5% processing fee applies",
      color: "#1565c0",
      bg: "#e3f2fd",
      disabled: true,
      disabledNote: "Coming soon",
    },
    {
      key: "check",
      emoji: "📝",
      label: "Check or Cash",
      badge: null,
      sublabel: "Mail or pay in person",
      color: "#2e7d32",
      bg: "#e8f5e9",
    },
  ];

  const CopyRow = ({ label, value, copied, onCopy }) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        bgcolor: "white",
        border: "1px solid #e0e0e0",
        borderRadius: 2,
        px: 2,
        py: 1.5,
        mb: 1,
      }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="body1" sx={{ fontWeight: 700 }}>{value}</Typography>
      </Box>
      <Tooltip title={copied ? "Copied!" : "Tap to copy"} placement="left">
        <IconButton
          onClick={() => copyToClipboard(value, onCopy)}
          sx={{
            bgcolor: copied ? "success.light" : "#f3e5f5",
            color: copied ? "success.dark" : "#6200ea",
            "&:hover": { bgcolor: copied ? "success.light" : "#e1bee7" },
          }}
        >
          {copied ? <CheckCircleIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 6 }}>

      {/* Header */}
      <Paper sx={{ p: { xs: 2, sm: 4 }, mb: 3 }}>
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <img
            src={COMPANY.logoPath}
            alt="Kings Canyon Landscaping"
            style={{ height: 60, marginBottom: 16 }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <Typography variant="h5" sx={{ fontWeight: 700, color: "#1565c0" }}>
            Payment Portal
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {COMPANY.name}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          Invoice for: {invoice.clientName || invoice.customerName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Invoice #{invoiceNum}
        </Typography>

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={4}>
            <Paper sx={{ p: 1.5, textAlign: "center", bgcolor: "grey.100" }}>
              <Typography variant="caption" color="text.secondary">Total</Typography>
              <Typography variant="h6">${totalAmount.toFixed(2)}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={4}>
            <Paper sx={{ p: 1.5, textAlign: "center", bgcolor: "success.light" }}>
              <Typography variant="caption">Paid</Typography>
              <Typography variant="h6" sx={{ color: "success.dark" }}>${totalPaid.toFixed(2)}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={4}>
            <Paper sx={{ p: 1.5, textAlign: "center", bgcolor: "error.light" }}>
              <Typography variant="caption">Due</Typography>
              <Typography variant="h6" sx={{ color: "error.dark" }}>${remainingBalance.toFixed(2)}</Typography>
            </Paper>
          </Grid>
        </Grid>

        {isDepositPayment && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Deposit Payment (50%):</strong> ${depositAmount.toFixed(2)}<br />
            Final payment of ${(totalAmount - depositAmount).toFixed(2)} will be due upon completion.
          </Alert>
        )}
      </Paper>

      {/* Payment Methods */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
        Choose Payment Method
      </Typography>

      {paymentMethods.map((method) => (
        <Box key={method.key} sx={{ mb: 1.5 }}>
          <Button
            fullWidth
            onClick={() => !method.disabled && setSelected(selected === method.key ? null : method.key)}
            disabled={method.disabled}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `2px solid ${selected === method.key ? method.color : "#e0e0e0"}`,
              bgcolor: selected === method.key ? method.bg : "white",
              justifyContent: "flex-start",
              textAlign: "left",
              textTransform: "none",
              "&:hover": { bgcolor: method.disabled ? "white" : method.bg },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 1.5 }}>
              <Typography sx={{ fontSize: 28 }}>{method.emoji}</Typography>
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, color: method.disabled ? "text.disabled" : method.color }}
                  >
                    {method.label}
                  </Typography>
                  {method.disabledNote ? (
                    <Chip label={method.disabledNote} size="small" sx={{ fontSize: "0.7rem" }} />
                  ) : method.badge ? (
                    <Chip label={method.badge} color={method.badgeColor} size="small" sx={{ fontSize: "0.7rem" }} />
                  ) : null}
                </Box>
                <Typography variant="caption" color={method.disabled ? "text.disabled" : "text.secondary"}>
                  {method.sublabel}
                </Typography>
              </Box>
              {!method.disabled && (
                <Typography sx={{ color: method.color, fontWeight: 700 }}>
                  {selected === method.key ? "▲" : "▼"}
                </Typography>
              )}
            </Box>
          </Button>

          {/* ── ZELLE PANEL ── */}
          <Collapse in={selected === "zelle" && method.key === "zelle"}>
            <Card sx={{ mt: 1, boxShadow: 2, bgcolor: "#f9f4ff" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <PaymentIcon sx={{ fontSize: 36, color: "#6200ea", mr: 1.5 }} />
                  <Box>
                    <Typography variant="h6">Pay with Zelle</Typography>
                    <Chip label="FREE — No Fees!" color="success" size="small" />
                  </Box>
                </Box>

                <Alert severity="info" sx={{ mb: 2 }}>
                  Open your banking app → Go to <strong>Zelle / Send Money</strong> → Use the details below
                </Alert>

                <CopyRow
                  label="Send To (Phone Number)"
                  value={COMPANY.zelleDisplay}
                  copied={copiedPhone}
                  onCopy={setCopiedPhone}
                />
                <CopyRow
                  label="Amount"
                  value={`$${currentPaymentAmount.toFixed(2)}`}
                  copied={copiedAmount}
                  onCopy={setCopiedAmount}
                />
                <CopyRow
                  label="Memo / Note"
                  value={`Invoice #${invoiceNum}`}
                  copied={copiedMemo}
                  onCopy={setCopiedMemo}
                />

                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{ mt: 2, bgcolor: "#6200ea", "&:hover": { bgcolor: "#4a00b0" } }}
                  onClick={() => handleMarkAsPaid("Zelle", currentPaymentAmount)}
                >
                  ✅ I've Sent Payment via Zelle
                </Button>
              </CardContent>
            </Card>
          </Collapse>

          {/* ── CHECK / CASH PANEL ── */}
          <Collapse in={selected === "check" && method.key === "check"}>
            <Card sx={{ mt: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>💵 Pay with Cash or Check</Typography>
                <Box sx={{ bgcolor: "grey.100", p: 2, borderRadius: 2, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Make check payable to:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, mb: 1.5 }}>{COMPANY.name}</Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Include in memo:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, mb: 1.5 }}>Invoice #{invoiceNum}</Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Amount Due:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: "success.main" }}>
                    ${remainingBalance.toFixed(2)}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>Mail check to:</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, mb: 1.5 }}>{COMPANY.address}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Prefer to pay in person? Call us to arrange:
                </Typography>
                <Typography variant="h6" color="primary" gutterBottom>{COMPANY.phone}</Typography>
                <Button
                  variant="outlined"
                  fullWidth
                  href={`tel:${COMPANY.phone.replace(/\D/g, "")}`}
                  sx={{ mt: 1 }}
                >
                  📞 Call to Arrange Payment
                </Button>
              </CardContent>
            </Card>
          </Collapse>
        </Box>
      ))}

      {/* Payment History */}
      {payments.length > 0 && (
        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h6" gutterBottom>Payment History</Typography>
          <Divider sx={{ mb: 2 }} />
          {payments.map((payment, index) => (
            <Box key={payment.id} sx={{ mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body1">
                    <strong>${parseFloat(payment.amount || 0).toFixed(2)}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {payment.paymentMethod} —{" "}
                    {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : "—"}
                  </Typography>
                </Box>
                <Chip label="Paid" color="success" size="small" />
              </Box>
              {index < payments.length - 1 && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}
        </Paper>
      )}

      {/* Footer */}
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Questions? Contact us at {COMPANY.phone} or {COMPANY.email}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {COMPANY.address}
        </Typography>
      </Box>
    </Container>
  );
}