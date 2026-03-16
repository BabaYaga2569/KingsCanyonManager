import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
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
  Alert,
} from "@mui/material";
import EmailIcon from '@mui/icons-material/Email';
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import SignatureCanvas from "react-signature-canvas";
import { sendContractEmail } from "./emailService";

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  cityState: "Bullhead City, AZ",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
  logoPath: "/logo-kcl.png",
};

const ContractEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");

  // signature canvases + timestamps
  const clientSigRef = useRef(null);
  const contractorSigRef = useRef(null);
  const [clientSignedAt, setClientSignedAt] = useState("");
  const [contractorSignedAt, setContractorSignedAt] = useState("");
  const [clientSigData, setClientSigData] = useState(null);
  const [contractorSigData, setContractorSigData] = useState(null);

  // cache the logo as a dataURL for jsPDF
  const [logoDataUrl, setLogoDataUrl] = useState(null);

  // ✅ HOOK 1: Preload logo
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
        setLogoDataUrl(null);
      }
    };
    img.onerror = () => {
      console.error("Failed to load company logo");
      setLogoDataUrl(null);
    };
    img.src = COMPANY.logoPath;
  }, []);

  // ✅ HOOK 2: Fetch contract data
  useEffect(() => {
    const fetchContract = async () => {
      try {
        const docRef = doc(db, "contracts", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setContract(data);
          
          // Load saved signatures if they exist
          if (data.clientSignature) {
            setClientSigData(data.clientSignature);
          }
          if (data.contractorSignature) {
            setContractorSigData(data.contractorSignature);
          }
          if (data.clientSignedAt) {
            setClientSignedAt(data.clientSignedAt);
          }
          if (data.contractorSignedAt) {
            setContractorSignedAt(data.contractorSignedAt);
          }
        } else {
          Swal.fire("Not found", "Contract not found.", "error");
          navigate("/contracts");
        }
      } catch (e) {
        console.error("Error loading contract:", e);
        Swal.fire("Error", "Failed to load contract.", "error");
        navigate("/contracts");
      } finally {
        setLoading(false);
      }
    };
    fetchContract();
  }, [id, navigate]);

  // ✅ HOOK 3: Load client signature when data changes
  useEffect(() => {
    if (clientSigData && clientSigRef.current) {
      try {
        clientSigRef.current.fromDataURL(clientSigData);
      } catch (e) {
        console.error("Error loading client signature:", e);
      }
    }
  }, [clientSigData]);

  // ✅ HOOK 3b: Look up customer email and info
  useEffect(() => {
    const findCustomerInfo = async () => {
      if (!contract) return;
      
      // Check alternate field names
      const currentEmail = contract.customerEmail || "";
      if (currentEmail) {
        setCustomerEmail(currentEmail);
      }
      
      try {
        let customerData = null;
        
        // Try by customerId first
        if (contract.customerId) {
          const customerDoc = await getDoc(doc(db, "customers", contract.customerId));
          if (customerDoc.exists()) {
            customerData = customerDoc.data();
          }
        }
        
        // Fallback: search by name
        if (!customerData && contract.clientName) {
          const q = query(collection(db, "customers"), where("name", "==", contract.clientName));
          const snap = await getDocs(q);
          if (!snap.empty) {
            customerData = snap.docs[0].data();
          }
        }
        
        if (customerData) {
          if (customerData.email) {
            setCustomerEmail(customerData.email);
          }
        }
      } catch (err) {
        console.error("Error looking up customer:", err);
      }
    };
    
    findCustomerInfo();
  }, [contract?.customerId, contract?.clientName]);

  // ✅ HOOK 4: Load contractor signature when data changes
  useEffect(() => {
    if (contractorSigData && contractorSigRef.current) {
      try {
        contractorSigRef.current.fromDataURL(contractorSigData);
      } catch (e) {
        console.error("Error loading contractor signature:", e);
      }
    }
  }, [contractorSigData]);

  const handleChange = (e) => {
    setContract({ ...contract, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!contract?.clientName) {
      Swal.fire("Missing Info", "Client name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "contracts", id);
      await updateDoc(docRef, {
        ...contract,
        clientSignature: clientSigData,
        contractorSignature: contractorSigData,
        clientSignedAt,
        contractorSignedAt,
        updatedAt: new Date().toISOString(),
      });
      Swal.fire("Saved", "Contract updated successfully.", "success");
    } catch (e) {
      console.error("Error saving contract:", e);
      Swal.fire("Error", "Failed to save changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const clearClientSig = () => {
    clientSigRef.current?.clear();
    setClientSignedAt("");
    setClientSigData(null);
  };

  const clearContractorSig = () => {
    contractorSigRef.current?.clear();
    setContractorSignedAt("");
    setContractorSigData(null);
  };

  const markClientSigned = () => {
    if (!clientSigRef.current || clientSigRef.current.isEmpty()) {
      Swal.fire("Empty Signature", "Please draw a signature first.", "warning");
      return;
    }
    const timestamp = new Date().toLocaleString();
    const sigData = clientSigRef.current.toDataURL();
    setClientSignedAt(timestamp);
    setClientSigData(sigData);
    Swal.fire({
      icon: "success",
      title: "Signature Saved!",
      text: "Client signature has been recorded.",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const markContractorSigned = () => {
    if (!contractorSigRef.current || contractorSigRef.current.isEmpty()) {
      Swal.fire("Empty Signature", "Please draw a signature first.", "warning");
      return;
    }
    const timestamp = new Date().toLocaleString();
    const sigData = contractorSigRef.current.toDataURL();
    setContractorSignedAt(timestamp);
    setContractorSigData(sigData);
    Swal.fire({
      icon: "success",
      title: "Signature Saved!",
      text: "Contractor signature has been recorded.",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Auto-sign for Darren (one-click)
  const autoSignForDarren = () => {
    const timestamp = new Date().toLocaleString();
    const darrenSig = generateDarrenAutoSignature();
    setContractorSignedAt(timestamp);
    setContractorSigData(darrenSig);
    
    // Show success message
    Swal.fire({
      icon: "success",
      title: "Auto-Signed!",
      text: "Darren's signature has been applied.",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Generate Darren's auto-signature
  const generateDarrenAutoSignature = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 100);
    
    // Signature text in cursive style
    ctx.font = '32px "Brush Script MT", cursive';
    ctx.fillStyle = 'black';
    ctx.fillText('Darren Bennett', 50, 60);
    
    return canvas.toDataURL('image/png');
  };

  const getDataUrlIfSigned = (sigData) => {
    if (!sigData) return null;
    return sigData;
  };

  // Build PDF and return jsPDF object (reused for download AND email)
  const buildContractPDF = () => {
    if (!contract) return null;

    const docPDF = new jsPDF({ unit: "pt", format: "letter" });
    const W = docPDF.internal.pageSize.getWidth();
    const H = docPDF.internal.pageSize.getHeight();

    // Frame / border
    docPDF.setDrawColor(60);
    docPDF.setLineWidth(1);
    docPDF.rect(28, 28, W - 56, H - 56);

    // Header - FIXED LAYOUT
    if (logoDataUrl) {
      try {
        docPDF.addImage(logoDataUrl, "PNG", 40, 42, 60, 60);
      } catch (e) {
        console.error("Error adding logo to PDF:", e);
      }
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

    // Title on the right - NO OVERLAP
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(14);
    docPDF.text("Service Contract", W - 40, 50, { align: "right" });
    docPDF.text("Agreement", W - 40, 66, { align: "right" });

    // Contract meta on the right
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.text(`Contract No.: ${id.slice(-8)}`, W - 40, 84, { align: "right" });
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
    writeLabelValue("Amount", contract.amount ? `$${contract.amount}` : "N/A");

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
      40, y, W - 80
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
      "Unless otherwise agreed, payment is due upon substantial completion of the project. Invoices are due within 14 days. A late payment fee of 5% may be applied to balances over 15 days past due.",
      40, y, W - 80
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
      40, y, W - 80
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
      40, y, W - 80
    );
    y += 8;

    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Permits and Licenses", 40, y);
    y += 14;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    y = writeParagraph(
      docPDF,
      "If permits or licenses are required for this job, the Client is responsible for obtaining and paying for all necessary permits unless otherwise agreed to in writing by Kings Canyon Landscaping LLC.",
      40, y, W - 80
    );
    y += 16;

    // Signatures
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.text("Authorization & Acceptance", 40, y);
    y += 14;
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    y = writeParagraph(
      docPDF,
      "By signing below, both parties agree to the terms of this agreement. Digital signatures are valid and binding.",
      40, y, W - 80
    );
    y += 20;

    // signature boxes
    const sigTop = y;
    const sigBoxH = 80;
    const col1X = 40;
    const col2X = W / 2 + 10;
    const boxW = W - 40 - col2X;

    docPDF.setDrawColor(120);
    docPDF.rect(col1X, sigTop, boxW, sigBoxH);
    docPDF.rect(col2X, sigTop, boxW, sigBoxH);

    const clientSig = getDataUrlIfSigned(clientSigData);
    const contractorSig = getDataUrlIfSigned(contractorSigData);

    if (clientSig) {
      try {
        docPDF.addImage(clientSig, "PNG", col1X + 6, sigTop + 6, boxW - 12, sigBoxH - 12);
      } catch (e) {
        console.error("Error adding client signature to PDF:", e);
      }
    }
    if (contractorSig) {
      try {
        docPDF.addImage(contractorSig, "PNG", col2X + 6, sigTop + 6, boxW - 12, sigBoxH - 12);
      } catch (e) {
        console.error("Error adding contractor signature to PDF:", e);
      }
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

    docPDF.text(`Signed: ${clientSignedAt || "—"}`, col1X, y);
    docPDF.text(`Signed: ${contractorSignedAt || "—"}`, col2X, y);

    // Footer
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(
      "Thank you for choosing Kings Canyon Landscaping. We appreciate your business.",
      W / 2, H - 36, { align: "center" }
    );

    return docPDF;
  };

  const handleGeneratePDF = async () => {
    if (!contract) {
      Swal.fire("Error", "No contract data available.", "error");
      return;
    }

    try {
      const docPDF = buildContractPDF();
      if (!docPDF) return;

      const filenameSafe = (contract.clientName || "Contract")
        .replace(/[^\w\- ]+/g, "_")
        .replace(/\s+/g, "_");
      const filename = `${filenameSafe}_Contract_${id.slice(-8)}.pdf`;
      docPDF.save(filename);

      Swal.fire({
        icon: "success",
        title: "PDF Downloaded!",
        text: `Contract saved as ${filename}`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      Swal.fire("Error", "Failed to generate PDF. Please try again.", "error");
    }
  };

  // ✅ EMAIL CONTRACT TO CUSTOMER
  const handleEmailToCustomer = async () => {
    // Prompt for email if we don't have one
    let emailToSend = customerEmail;
    
    if (!emailToSend) {
      const { value: enteredEmail } = await Swal.fire({
        title: 'Customer Email',
        input: 'email',
        inputLabel: `Enter email for ${contract.clientName}`,
        inputPlaceholder: 'customer@email.com',
        showCancelButton: true,
        confirmButtonText: 'Send',
        validationMessage: 'Please enter a valid email address',
      });
      
      if (!enteredEmail) return;
      emailToSend = enteredEmail;
      setCustomerEmail(enteredEmail);
      
      // Save email to contract for next time
      try {
        await updateDoc(doc(db, "contracts", id), { customerEmail: enteredEmail });
      } catch (e) {
        console.error("Error saving customer email:", e);
      }
    }
    
    // Confirm before sending
    const confirm = await Swal.fire({
      title: 'Email Contract',
      html: `Send contract PDF to:<br/><strong>${contract.clientName}</strong><br/>${emailToSend}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Send Email',
      confirmButtonColor: '#1565c0',
    });
    
    if (!confirm.isConfirmed) return;
    
    setSending(true);
    try {
      // Generate PDF as base64
      const docPDF = buildContractPDF();
      if (!docPDF) throw new Error("Failed to generate PDF");
      
      const pdfBase64 = docPDF.output('datauristring').split(',')[1];
      
      // Send via Cloud Function
      await sendContractEmail(
        emailToSend,
        contract.clientName,
        { ...contract, id },
        pdfBase64
      );
      
      // Update contract status if still Pending
      if (contract.status === "Pending") {
        await updateDoc(doc(db, "contracts", id), {
          status: "Sent - Awaiting Client Signature",
          emailSentAt: new Date().toISOString(),
          emailSentTo: emailToSend,
        });
        setContract({ ...contract, status: "Sent - Awaiting Client Signature" });
      }
      
      Swal.fire({
        icon: 'success',
        title: 'Email Sent!',
        html: `Contract sent to <strong>${emailToSend}</strong>`,
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

  // helper to write long paragraphs with natural wrap
  const writeParagraph = (doc, text, x, yStart, maxWidth) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, yStart);
    return yStart + lines.length * 12;
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading contract...
        </Typography>
      </Container>
    );
  }

  if (!contract) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6" color="error">
          Contract not found or failed to load.
        </Typography>
        <Button 
          variant="contained" 
          onClick={() => navigate("/contracts")}
          sx={{ mt: 2 }}
        >
          Back to Contracts
        </Button>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: { xs: 2, sm: 4 }, mb: 6, px: { xs: 2, sm: 3 } }}>
      <Paper 
        elevation={2}
        sx={{ 
          p: { xs: 2, sm: 3 },
          borderRadius: 2
        }}
      >
        <Typography 
          variant="h5" 
          gutterBottom
          sx={{ 
            fontSize: { xs: '1.5rem', sm: '2rem' },
            mb: 3
          }}
        >
          Edit Contract — {contract.clientName || "Unnamed"}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 900 }}>
          <TextField
            label="Client Name"
            name="clientName"
            value={contract.clientName || ""}
            onChange={handleChange}
            fullWidth
            required
            helperText="Required field"
          />

          <TextField
            label="Description"
            name="description"
            multiline
            rows={4}
            value={contract.description || ""}
            onChange={handleChange}
            fullWidth
            helperText="Describe the scope of work"
          />

          <TextField
            label="Amount ($)"
            name="amount"
            type="number"
            value={contract.amount || ""}
            onChange={handleChange}
            fullWidth
            inputProps={{ min: 0, step: "0.01" }}
            helperText="Total contract amount"
          />

          <TextField
            select
            label="Status"
            name="status"
            value={contract.status || "Pending"}
            onChange={handleChange}
            fullWidth
            helperText="Current contract status"
          >
            <MenuItem value="Pending">Pending</MenuItem>
            <MenuItem value="Sent - Awaiting Client Signature">Sent - Awaiting Signature</MenuItem>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="Completed">Completed</MenuItem>
            <MenuItem value="Cancelled">Cancelled</MenuItem>
          </TextField>

          {/* Signature pads */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Signatures
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Client Signature
                </Typography>
                <SignatureCanvas
                  ref={clientSigRef}
                  canvasProps={{
                    width: 400,
                    height: 180,
                    style: { 
                      border: "1px solid #ccc", 
                      borderRadius: 8, 
                      width: "100%",
                      touchAction: "none"
                    },
                  }}
                />
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <Button 
                    size="small" 
                    variant="outlined" 
                    onClick={markClientSigned}
                    color="primary"
                  >
                    Save Signature
                  </Button>
                  <Button 
                    size="small" 
                    variant="text" 
                    onClick={clearClientSig}
                    color="error"
                  >
                    Clear
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: "block", color: clientSignedAt ? "success.main" : "text.secondary" }}>
                  {clientSignedAt ? `✓ Signed: ${clientSignedAt}` : "Not yet signed"}
                </Typography>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Contractor Signature
                </Typography>
                <Typography variant="caption" display="block" sx={{ mb: 1, color: "text.secondary" }}>
                  Kings Canyon Landscaping LLC
                </Typography>
                <SignatureCanvas
                  ref={contractorSigRef}
                  canvasProps={{
                    width: 400,
                    height: 180,
                    style: { 
                      border: "1px solid #ccc", 
                      borderRadius: 8, 
                      width: "100%",
                      touchAction: "none"
                    },
                  }}
                />
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <Button 
                    size="small" 
                    variant="contained" 
                    color="success"
                    onClick={autoSignForDarren}
                    sx={{ flexGrow: 1 }}
                  >
                    ✍️ Auto-Sign (Darren)
                  </Button>
                  <Button 
                    size="small" 
                    variant="outlined" 
                    onClick={markContractorSigned}
                  >
                    Save Manual
                  </Button>
                  <Button 
                    size="small" 
                    variant="text" 
                    onClick={clearContractorSig}
                    color="error"
                  >
                    Clear
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: "block", color: contractorSignedAt ? "success.main" : "text.secondary" }}>
                  {contractorSignedAt ? `✓ Signed: ${contractorSignedAt}` : "Not yet signed"}
                </Typography>
              </Paper>
            </Box>
          </Box>

          {contract.createdAt && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
              Created: {new Date(contract.createdAt).toLocaleString()}
            </Typography>
          )}

          {/* Customer Email Info */}
          {customerEmail && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Customer email on file: <strong>{customerEmail}</strong>
            </Alert>
          )}

          {/* Email sent status */}
          {contract.emailSentAt && (
            <Alert severity="success" sx={{ mt: 1 }} icon={<EmailIcon />}>
              Contract emailed to <strong>{contract.emailSentTo}</strong> on {new Date(contract.emailSentAt).toLocaleString()}
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 2, mt: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Button 
              variant="contained" 
              onClick={handleSave} 
              disabled={saving}
              size="large"
              sx={{ minWidth: 140 }}
              fullWidth
            >
              {saving ? "Saving..." : "Save Contract"}
            </Button>
            <Button 
              variant="contained" 
              color="success" 
              onClick={handleEmailToCustomer}
              disabled={sending}
              size="large"
              startIcon={<EmailIcon />}
              fullWidth
            >
              {sending ? "Sending..." : "Email to Customer"}
            </Button>
            <Button 
              variant="outlined" 
              color="success" 
              onClick={handleGeneratePDF}
              size="large"
              fullWidth
            >
              Download PDF
            </Button>
            <Button 
              variant="text" 
              color="inherit" 
              onClick={() => navigate("/contracts")}
              size="large"
              fullWidth
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default ContractEditor;