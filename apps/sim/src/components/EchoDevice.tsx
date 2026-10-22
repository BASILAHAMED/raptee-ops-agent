"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS, type Persona } from "@/lib/personas";

interface ToolTrace {
  tool: string;
  args: Record<string, unknown>;
  response: unknown;
  isError: boolean;
}

interface TurnRecord {
  role: "user" | "agent";
  text: string;
  tier?: "groq" | "gemini" | "scripted";
  toolCalls?: ToolTrace[];
}

interface OwnerCtx {
  ownerId: string;
  ownerName: string;
  bikeVin: string;
  model: string;
  color: string;
}
interface LeadCtx {
  leadId: string;
  leadName: string;
}

// Minimal typing for the Web Speech API's SpeechRecognition — not in default TS DOM libs.
interface SpeechRecognitionResultLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionResultLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export default function EchoDevice() {
  const [persona, setPersona] = useState<Persona>("prospect");
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<OwnerCtx[]>([]);
  const [leads, setLeads] = useState<LeadCtx[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [selectedLead, setSelectedLead] = useState<string>("");
  const [speechOn, setSpeechOn] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);

  const activePersona = PERSONAS.find((p) => p.id === persona)!;

  useEffect(() => {
    fetch("/api/context")
      .then((r) => r.json())
      .then((data) => {
        setOwners(data.owners ?? []);
        setLeads(data.leads ?? []);
        if (data.owners?.[0]) setSelectedOwner(data.owners[0].ownerId);
        if (data.leads?.[0]) setSelectedLead(data.leads[0].leadId);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      const stored = localStorage.getItem("raptee-voice");
      if (stored && v.some((x) => x.name === stored)) {
        setVoiceName(stored);
      } else if (v.length && !voiceName) {
        const friendly =
          v.find((x) => /natural|friendly|aria|jenny|samantha|google us english/i.test(x.name)) ?? v[0];
        setVoiceName(friendly.name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [voiceName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    const w = window as SRWindow;
    setCanListen(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  function listen() {
    if (listening || loading) return;
    const w = window as SRWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (!recognitionRef.current) {
      const r = new Ctor();
      r.lang = "en-US";
      r.interimResults = false;
      r.continuous = false;
      r.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript;
        if (transcript) void send(transcript);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recognitionRef.current = r;
    }
    setListening(true);
    recognitionRef.current.start();
  }

  function speak(text: string) {
    if (!speechOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
    const v = voices.find((x) => x.name === voiceName);
    if (v) utter.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function onVoiceChange(name: string) {
    setVoiceName(name);
    localStorage.setItem("raptee-voice", name);
  }

  async function send(message: string) {
    if (!message.trim() || loading) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    const context: Record<string, string> = {};
    const owner = owners.find((o) => o.ownerId === selectedOwner);
    if (owner) {
      context.ownerId = owner.ownerId;
      context.bikeVin = owner.bikeVin;
    }
    if (selectedLead) context.leadId = selectedLead;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, persona, context })
      });
      const data = await res.json();
      const text = data.reply ?? data.error ?? "No response";
      setTurns((t) => [...t, { role: "agent", text, tier: data.tier, toolCalls: data.toolCalls }]);
      speak(text);
    } catch (err) {
      setTurns((t) => [...t, { role: "agent", text: `Error: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="device-shell">
      <div className="device-screen">
        <div className="persona-tabs">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`persona-tab ${p.id === persona ? "active" : ""}`}
              onClick={() => setPersona(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {turns.length === 0 ? (
          <>
            <div className="ambient-clock">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="ambient-sub">{activePersona.blurb}</div>
            <div className="prompt-grid">
              {activePersona.examplePrompts.map((p) => (
                <button key={p} className="prompt-chip" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="transcript" ref={scrollRef}>
            {turns.map((t, i) => (
              <div key={i} className={`bubble ${t.role}`}>
                {t.text}
                {t.tier && <span className="tier-badge">{t.tier}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          <input
            value={input}
            placeholder={`Ask as ${activePersona.label}...`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
          />
          {canListen && (
            <button
              type="button"
              onClick={listen}
              disabled={loading || listening}
              className={listening ? "mic-active" : undefined}
              title={listening ? "Listening..." : "Speak instead of typing"}
              aria-label="Speak your question"
            >
              {listening ? "Listening..." : "🎤"}
            </button>
          )}
          <button onClick={() => send(input)} disabled={loading}>
            {loading ? "..." : "Ask"}
          </button>
        </div>

        <div className="toolbar">
          {persona === "owner" && owners.length > 0 && (
            <label>
              Owner:{" "}
              <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}>
                {owners.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.ownerName} ({o.model}, {o.color})
                  </option>
                ))}
              </select>
            </label>
          )}
          {persona === "prospect" && leads.length > 0 && (
            <label>
              Lead:{" "}
              <select value={selectedLead} onChange={(e) => setSelectedLead(e.target.value)}>
                {leads.map((l) => (
                  <option key={l.leadId} value={l.leadId}>
                    {l.leadName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <input type="checkbox" checked={speechOn} onChange={(e) => setSpeechOn(e.target.checked)} /> Voice output
          </label>
          {voices.length > 0 && (
            <label>
              Voice:{" "}
              <select value={voiceName} onChange={(e) => onVoiceChange(e.target.value)}>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={() => setDrawerOpen((d) => !d)}>{drawerOpen ? "Hide" : "Show"} trace</button>
        </div>

        {drawerOpen && (
          <div className="drawer">
            <h4>Traceability</h4>
            {turns
              .filter((t) => t.role === "agent")
              .slice(-1)
              .map((t, i) => (
                <div key={i}>
                  <div className="trace-label">Answered by: {t.tier ?? "unknown"}</div>
                  {(t.toolCalls ?? []).length === 0 && <div className="trace-label">No MCP tool calls this turn.</div>}
                  {(t.toolCalls ?? []).map((c, j) => (
                    <div className="trace-call" key={j}>
                      <div className="trace-label">
                        Tool: <strong>{c.tool}</strong> {c.isError ? "(error)" : ""}
                      </div>
                      <div className="trace-label">Arguments:</div>
                      <pre>{JSON.stringify(c.args, null, 2)}</pre>
                      <div className="trace-label">Response:</div>
                      <pre>{JSON.stringify(c.response, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
