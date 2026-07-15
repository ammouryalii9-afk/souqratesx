import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../lib/i18n";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";

type ContractSettings = {
  botName: string;
  botLogoUrl: string;
  contractText: string;
  party2Obligations: string;
  publicationPage: string;
};

type FormState = {
  name: string;
  age: string;
  country: string;
};

async function fetchSettings(): Promise<ContractSettings> {
  const res = await fetch("/api/contract/settings");
  if (!res.ok) throw new Error("Failed to load");
  return res.json() as Promise<ContractSettings>;
}

async function submitSignature(data: {
  name: string;
  age: number;
  country: string;
  signatureDataUrl: string;
}): Promise<void> {
  const res = await fetch("/api/contract/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to submit");
  }
}

function SignaturePad({ onSignature }: { onSignature: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  function getPosFromEvent(e: React.MouseEvent | React.TouchEvent, rect: DOMRect) {
    if ("touches" in e) {
      const t = e.touches[0]!;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    const rect = canvas.getBoundingClientRect();
    const point = getPosFromEvent(e, rect);
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const point = getPosFromEvent(e, rect);
    const ctx = canvas.getContext("2d")!;
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setIsEmpty(false);
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onSignature(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onSignature("");
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-white/20 bg-white/5">
        <canvas
          ref={canvasRef}
          width={340}
          height={160}
          className="w-full touch-none cursor-crosshair block"
          style={{ height: "160px" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-white/30 text-sm">وقّع هنا بإصبعك</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-muted-foreground underline"
      >
        مسح التوقيع
      </button>
    </div>
  );
}

export function ContractPage() {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  const [settings, setSettings] = useState<ContractSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "", age: "", country: "" });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => setLoadError(true));
  }, []);

  function handleInput(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signatureDataUrl) {
      setError(isAr ? "يرجى التوقيع أولاً" : "Please sign first");
      return;
    }
    const ageNum = Number(form.age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      setError(isAr ? "يرجى إدخال عمر صحيح" : "Please enter a valid age");
      return;
    }
    setSubmitting(true);
    try {
      await submitSignature({
        name: form.name.trim(),
        age: ageNum,
        country: form.country.trim(),
        signatureDataUrl,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] flex items-center justify-center p-6">
        <p className="text-red-400 text-sm text-center">
          {isAr ? "تعذّر تحميل العقد. يرجى المحاولة مرة أخرى." : "Failed to load contract. Please try again."}
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-3xl">✅</div>
          <h2 className="text-white font-bold text-xl">{isAr ? "تم التوقيع بنجاح" : "Signed Successfully"}</h2>
          <p className="text-muted-foreground text-sm">
            {isAr
              ? "شكراً لك! تم حفظ توقيعك بنجاح."
              : "Thank you! Your signature has been saved successfully."}
          </p>
        </div>
      </div>
    );
  }

  const displayLogo = settings.botLogoUrl || logo;
  const displayName = settings.botName || "SouqratesX";

  return (
    <div
      className="min-h-screen bg-[#0D0D0F] text-white pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={displayLogo}
            alt={displayName}
            className="w-20 h-20 rounded-2xl object-cover shadow-lg"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAr ? "عقد الاتفاقية" : "Agreement Contract"}
            </p>
          </div>
        </div>

        {/* Contract Text */}
        {settings.contractText && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-primary mb-3">
              {isAr ? "نص الاتفاقية" : "Agreement Terms"}
            </h2>
            <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
              {settings.contractText}
            </div>
          </div>
        )}

        {/* Party 2 Obligations */}
        {settings.party2Obligations && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-amber-400 mb-3">
              {isAr ? "التزامات الطرف الثاني" : "Party 2 Obligations"}
            </h2>
            <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
              {settings.party2Obligations}
            </div>
          </div>
        )}

        {/* Publication Page */}
        {settings.publicationPage && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-start gap-2">
            <span className="text-lg flex-shrink-0">📄</span>
            <div>
              <p className="text-xs text-blue-300 font-medium">
                {isAr ? "صفحة النشر" : "Publication Page"}
              </p>
              <p className="text-sm text-white/80 mt-0.5">{settings.publicationPage}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-sm font-bold text-white">
            {isAr ? "المعلومات الشخصية" : "Personal Information"}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {isAr ? "الاسم الكامل *" : "Full Name *"}
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => handleInput("name", e.target.value)}
                placeholder={isAr ? "أدخل اسمك الكامل" : "Enter your full name"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {isAr ? "العمر *" : "Age *"}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => handleInput("age", e.target.value)}
                  placeholder={isAr ? "عمرك" : "Your age"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {isAr ? "الدولة *" : "Country *"}
                </label>
                <input
                  type="text"
                  required
                  value={form.country}
                  onChange={(e) => handleInput("country", e.target.value)}
                  placeholder={isAr ? "مثال: السعودية" : "e.g. Saudi Arabia"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Signature */}
          <div>
            <h2 className="text-sm font-bold text-white mb-2">
              {isAr ? "التوقيع *" : "Signature *"}
            </h2>
            <SignaturePad onSignature={setSignatureDataUrl} />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl py-2 px-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !form.name || !form.age || !form.country || !signatureDataUrl}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 rounded-2xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? (isAr ? "جار الإرسال..." : "Submitting...")
              : (isAr ? "توقيع وإرسال الاتفاقية" : "Sign & Submit Agreement")}
          </button>
        </form>
      </div>
    </div>
  );
}
