import { useState, useEffect } from "react";
import type {
    LogEntry,
    ExtensionSettings,
    DetectedJob,
} from "../shared/types.js";
import {
    DEFAULT_SETTINGS,
    normalizeMcpSecret,
    normalizeMcpUrl,
} from "../shared/types.js";
import Settings from "./Settings.js";

const STYLES = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1); } }
  * { box-sizing: border-box; }
  button, input, textarea { font: inherit; }
  button { transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease; }
  button:hover:not(:disabled), a:hover { filter: brightness(0.98); }
  button:focus-visible, input:focus-visible, a:focus-visible {
    outline: 2px solid rgba(35, 90, 142, 0.35);
    outline-offset: 2px;
  }
`;

const BG = "#fbfaf7";
const SURFACE = "#f3f1ec";
const CARD_BG = "#ffffff";
const BORDER = "#dedad2";
const BORDER_STRONG = "#c9c3b8";
const BORDER_ACCENT = "rgba(35,90,142,0.18)";
const TEXT_PRIMARY = "#171717";
const TEXT_SECONDARY = "#5f5b53";
const TEXT_MUTED = "#8d877d";
const ACCENT = "#235a8e";
const ACCENT_SOFT = "#6e93b8";
const ACCENT_BG = "#eaf1f7";
const SUCCESS = "#287a4b";
const SUCCESS_BG = "#edf7f1";
const ERROR = "#b23a30";
const ERROR_BG = "#fbefed";
const PENDING = "#9a6700";
const PENDING_BG = "#fff5db";
const FONT =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const ERROR_TTL_MS = 10 * 60 * 1000;
const SOURCE_PLATFORMS = [
    "ashby",
    "greenhouse",
    "lever",
    "linkedin",
    "manual",
    "workday",
] as const satisfies readonly DetectedJob["sourcePlatform"][];

type ServerStatus = "checking" | "online" | "offline" | "auth_error";
type TrackingStep = "none" | "prompt" | "tracking";
type MainTab = "track" | "recent";

interface CurrentPageJob {
    company: string;
    role: string;
    url: string;
    sourcePlatform: DetectedJob["sourcePlatform"];
    jdText: string;
}

function isStaleError(entry: LogEntry): boolean {
    if (entry.status !== "error") return false;
    return Date.now() - new Date(entry.loggedAt).getTime() > ERROR_TTL_MS;
}

function isLogEntry(value: unknown): value is LogEntry {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v["status"] === "string" &&
        typeof v["company"] === "string" &&
        typeof v["role"] === "string" &&
        typeof v["loggedAt"] === "string"
    );
}

function isSourcePlatform(value: unknown): value is DetectedJob["sourcePlatform"] {
    return (
        typeof value === "string" &&
        (SOURCE_PLATFORMS as readonly string[]).includes(value)
    );
}

function isTrackableUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

function domainFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "Current tab";
    }
}

function companyFromUrl(url: string): string {
    const domain = domainFromUrl(url);
    const segment = domain.split(".")[0] ?? "";
    if (segment === "") return "";
    return segment
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function initials(company: string): string {
    const letters = company
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
    return letters || "JT";
}

function BriefcaseIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
    );
}

function GearIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

function DetectionIcon({ size = 20 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

function NoteIcon({ size = 14 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
            <path d="M8 6h8" />
            <path d="M8 10h8" />
        </svg>
    );
}

function BackArrowIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
        </svg>
    );
}

function SearchIcon({ size = 20 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
        </svg>
    );
}

function Spinner({ size = 14 }: { size?: number }) {
    return (
        <span
            style={{
                width: size,
                height: size,
                border: `2px solid ${BORDER}`,
                borderTopColor: ACCENT,
                borderRadius: "50%",
                animation: "spin 0.75s linear infinite",
                display: "inline-block",
                flexShrink: 0,
            }}
        />
    );
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
    return (
        <span
            style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
                animation: pulse ? "pulse 1.6s ease-in-out infinite" : "none",
            }}
        />
    );
}

function JobGlyph({
    company,
    size = 36,
    light = false,
}: {
    company: string;
    size?: number;
    light?: boolean;
}) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                fontSize: size === 36 ? 12 : 11,
                fontWeight: 700,
                letterSpacing: 0,
                color: light ? ACCENT : "#ffffff",
                background: light ? ACCENT_BG : ACCENT,
                border: light ? `1px solid ${BORDER_ACCENT}` : `1px solid ${ACCENT}`,
            }}
        >
            {initials(company)}
        </div>
    );
}

function Header({
    status,
    onSettings,
}: {
    status: ServerStatus;
    onSettings: () => void;
}) {
    const statusConfig: Record<ServerStatus, { color: string; label: string }> =
        {
            checking: { color: TEXT_MUTED, label: "Checking server…" },
            online: { color: SUCCESS, label: "Server connected" },
            offline: {
                color: ERROR,
                label: "Server offline — run npm run dev",
            },
            auth_error: {
                color: PENDING,
                label: "Auth error — check MCP Secret in Settings",
            },
        };
    const { color, label } = statusConfig[status];

    return (
        <header
            style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        display: "grid",
                        placeItems: "center",
                        background: CARD_BG,
                        border: `1px solid ${BORDER}`,
                        color: ACCENT,
                    }}
                >
                    <BriefcaseIcon size={16} />
                </div>
                <div>
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: TEXT_PRIMARY,
                            lineHeight: 1.2,
                        }}
                    >
                        Job Tracker
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 4,
                        }}
                    >
                        <StatusDot
                            color={color}
                            pulse={status === "checking"}
                        />
                        <span style={{ fontSize: 11, color, fontWeight: 500 }}>
                            {label}
                        </span>
                    </div>
                </div>
            </div>
            <button
                onClick={onSettings}
                aria-label="Open settings"
                title="Settings"
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: `1px solid ${BORDER}`,
                    background: CARD_BG,
                    color: TEXT_SECONDARY,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                }}
            >
                <GearIcon size={16} />
            </button>
        </header>
    );
}

function Divider() {
    return (
        <div
            style={{
                height: 1,
                background: BORDER,
                margin: "12px 0",
            }}
        />
    );
}

function SegmentedControl({
    activeTab,
    onChange,
}: {
    activeTab: MainTab;
    onChange: (tab: MainTab) => void;
}) {
    return (
        <div
            role="tablist"
            aria-label="Popup view"
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
                padding: 3,
                marginBottom: 12,
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: SURFACE,
            }}
        >
            {(["track", "recent"] as const).map((tab) => {
                const selected = activeTab === tab;
                return (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(tab)}
                        style={{
                            height: 28,
                            borderRadius: 6,
                            border: `1px solid ${
                                selected ? BORDER_STRONG : "transparent"
                            }`,
                            background: selected ? CARD_BG : "transparent",
                            color: selected ? TEXT_PRIMARY : TEXT_SECONDARY,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: selected
                                ? "0 1px 2px rgba(23,23,23,0.06)"
                                : "none",
                        }}
                    >
                        {tab === "track" ? "Track" : "Recent"}
                    </button>
                );
            })}
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    return (
        <label style={{ display: "block" }}>
            <span
                style={{
                    display: "block",
                    color: TEXT_SECONDARY,
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                }}
            >
                {label}
            </span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                style={{
                    width: "100%",
                    height: 36,
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: CARD_BG,
                    color: TEXT_PRIMARY,
                    outline: "none",
                    padding: "0 11px",
                    fontSize: 13,
                }}
            />
        </label>
    );
}

function PrimaryButton({
    children,
    disabled,
    onClick,
}: {
    children: string;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                height: 40,
                borderRadius: 8,
                border: `1px solid ${disabled ? BORDER_STRONG : ACCENT}`,
                background: disabled ? SURFACE : ACCENT,
                color: disabled ? TEXT_MUTED : "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                boxShadow: disabled ? "none" : "0 1px 2px rgba(23,23,23,0.12)",
            }}
        >
            {children}
        </button>
    );
}

function GhostButton({
    children,
    onClick,
    disabled,
}: {
    children: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                height: 38,
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: CARD_BG,
                color: TEXT_SECONDARY,
                fontSize: 13,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {children}
        </button>
    );
}

function IdleState({
    onManualTrack,
    canTrack,
}: {
    onManualTrack: () => void;
    canTrack: boolean;
}) {
    return (
        <section style={{ animation: "fadeIn 0.2s ease" }}>
            <div
                style={{
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: CARD_BG,
                    padding: 14,
                    marginBottom: 12,
                    boxShadow: "0 1px 2px rgba(23,23,23,0.04)",
                }}
            >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            display: "grid",
                            placeItems: "center",
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            color: TEXT_MUTED,
                        }}
                    >
                        <SearchIcon size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div
                            style={{
                                color: TEXT_PRIMARY,
                                fontSize: 14,
                                fontWeight: 700,
                                marginBottom: 3,
                            }}
                        >
                            No job detected
                        </div>
                        <div
                            style={{
                                color: TEXT_SECONDARY,
                                fontSize: 12,
                                lineHeight: 1.4,
                            }}
                        >
                            Navigate to a job posting page and we'll detect it
                            automatically.
                        </div>
                    </div>
                </div>
            </div>

            <PrimaryButton onClick={onManualTrack} disabled={!canTrack}>
                Track this job manually
            </PrimaryButton>

            <button
                onClick={onManualTrack}
                disabled={!canTrack}
                style={{
                    display: "block",
                    margin: "10px auto 0",
                    background: "none",
                    border: "none",
                    color: TEXT_MUTED,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: canTrack ? "pointer" : "not-allowed",
                    opacity: canTrack ? 1 : 0.5,
                }}
            >
                Not a job listing?
            </button>

            <div
                style={{
                    marginTop: 12,
                    borderRadius: 8,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <NoteIcon size={14} />
                <span
                    style={{
                        fontSize: 12,
                        color: TEXT_SECONDARY,
                        fontWeight: 500,
                        lineHeight: 1.4,
                    }}
                >
                    Tip: We'll auto-fill details so you can save in one click.
                </span>
            </div>
        </section>
    );
}

function DetectedState({
    job,
    editCompany,
    editRole,
    setEditCompany,
    setEditRole,
    onSave,
    promptOnly,
    onAccept,
    onManualTrack,
}: {
    job: CurrentPageJob;
    editCompany: string;
    editRole: string;
    setEditCompany: (value: string) => void;
    setEditRole: (value: string) => void;
    onSave: () => void;
    promptOnly: boolean;
    onAccept: () => void;
    onManualTrack: () => void;
}) {
    return (
        <section style={{ animation: "fadeIn 0.2s ease" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                }}
            >
                <div
                    style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        display: "grid",
                        placeItems: "center",
                        color: SUCCESS,
                        background: SUCCESS_BG,
                        border: `1px solid rgba(40,122,75,0.22)`,
                    }}
                >
                    <DetectionIcon size={15} />
                </div>
                <div>
                    <div
                        style={{
                            color: TEXT_PRIMARY,
                            fontSize: 14,
                            fontWeight: 700,
                        }}
                    >
                        Job detected!
                    </div>
                    <div
                        style={{
                            color: TEXT_SECONDARY,
                            fontSize: 12,
                            marginTop: 2,
                        }}
                    >
                        We found this job page
                    </div>
                </div>
            </div>

            <div
                style={{
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: CARD_BG,
                    padding: 14,
                    marginBottom: 12,
                    boxShadow: "0 1px 2px rgba(23,23,23,0.04)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <JobGlyph company={editCompany || job.company || "Job"} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                            style={{
                                color: TEXT_PRIMARY,
                                fontSize: 14,
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {editRole || job.role || "Untitled role"}
                        </div>
                        <div
                            style={{
                                color: TEXT_SECONDARY,
                                fontSize: 12,
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {editCompany ||
                                job.company ||
                                domainFromUrl(job.url)}
                        </div>
                    </div>
                </div>
            </div>

            {!promptOnly && (
                <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                    <Field
                        label="Company"
                        value={editCompany}
                        onChange={setEditCompany}
                        placeholder="Company"
                    />
                    <Field
                        label="Role"
                        value={editRole}
                        onChange={setEditRole}
                        placeholder="Role title"
                    />
                </div>
            )}

            <PrimaryButton
                onClick={promptOnly ? onAccept : onSave}
                disabled={
                    !promptOnly && (!editCompany || !editRole || !job.url)
                }
            >
                {promptOnly ? "Review details" : "Start tracking this job"}
            </PrimaryButton>

            <button
                onClick={onManualTrack}
                style={{
                    display: "block",
                    margin: "10px auto 0",
                    background: "none",
                    border: "none",
                    color: TEXT_MUTED,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                }}
            >
                Not a job listing?
            </button>
        </section>
    );
}

function ResultState({
    entry,
    onViewDashboard,
}: {
    entry: LogEntry;
    onViewDashboard: () => void;
}) {
    const config = {
        pending: {
            color: PENDING,
            title: "Saving job…",
            subtitle: "Sending to your tracker",
            icon: <Spinner size={18} />,
        },
        logged: {
            color: SUCCESS,
            title: "Job saved!",
            subtitle: "Added to your tracker",
            icon: <span style={{ fontSize: 18, fontWeight: 700 }}>✓</span>,
        },
        error: {
            color: ERROR,
            title: "Save failed",
            subtitle: entry.error ?? "Unknown error",
            icon: <span style={{ fontSize: 18, fontWeight: 700 }}>!</span>,
        },
    }[entry.status];

    return (
        <section style={{ animation: "fadeIn 0.2s ease" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                }}
            >
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background:
                            entry.status === "logged"
                                ? SUCCESS_BG
                                : entry.status === "pending"
                                  ? PENDING_BG
                                  : ERROR_BG,
                        border: `1px solid ${config.color}30`,
                        color: config.color,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                    }}
                >
                    {config.icon}
                </div>
                <div>
                    <div
                        style={{
                            color: TEXT_PRIMARY,
                            fontSize: 15,
                            fontWeight: 700,
                        }}
                    >
                        {config.title}
                    </div>
                    <div
                        style={{
                            color: TEXT_SECONDARY,
                            fontSize: 12,
                            marginTop: 2,
                        }}
                    >
                        {config.subtitle}
                    </div>
                </div>
            </div>

            <div
                style={{
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: CARD_BG,
                    padding: 14,
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    boxShadow: "0 1px 2px rgba(23,23,23,0.04)",
                }}
            >
                <JobGlyph company={entry.company} light />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                        style={{
                            color: TEXT_PRIMARY,
                            fontSize: 14,
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {entry.role}
                    </div>
                    <div
                        style={{
                            color: TEXT_SECONDARY,
                            fontSize: 12,
                            marginTop: 2,
                        }}
                    >
                        {entry.company}
                    </div>
                </div>
                {entry.notionUrl !== undefined && (
                    <a
                        href={entry.notionUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open Notion page for saved job"
                        style={{
                            borderRadius: 6,
                            border: `1px solid ${SUCCESS}40`,
                            background: SUCCESS_BG,
                            color: SUCCESS,
                            padding: "6px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Open Notion
                    </a>
                )}
            </div>

            {entry.status === "logged" && (
                <button
                    onClick={onViewDashboard}
                    style={{
                        display: "block",
                        margin: "0 auto",
                        background: "none",
                        border: "none",
                        color: ACCENT,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    View dashboard →
                </button>
            )}
        </section>
    );
}

function RecentSection({ entries }: { entries: LogEntry[] }) {
    return (
        <section style={{ marginTop: 12 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: TEXT_MUTED,
                    }}
                >
                    Recent
                </span>
                {entries.length > 0 && (
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: TEXT_SECONDARY,
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: 999,
                            padding: "2px 8px",
                        }}
                    >
                        {entries.length}
                    </span>
                )}
            </div>

            {entries.length === 0 ? (
                <div
                    style={{
                        height: 60,
                        borderRadius: 8,
                        border: `1px dashed ${BORDER_STRONG}`,
                        color: TEXT_MUTED,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        background: SURFACE,
                    }}
                >
                    Nothing saved yet
                </div>
            ) : (
                <div style={{ display: "grid", gap: 8 }}>
                    {entries.slice(0, 3).map((item) => {
                        const color =
                            item.status === "logged"
                                ? SUCCESS
                                : item.status === "pending"
                                  ? PENDING
                                  : ERROR;
                        return (
                            <div
                                key={`${item.status}-${item.company}-${item.role}-${item.loggedAt}`}
                                style={{
                                    minHeight: 40,
                                    borderRadius: 8,
                                    border: `1px solid ${BORDER}`,
                                    background: CARD_BG,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 10px",
                                }}
                            >
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: color,
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            color: TEXT_PRIMARY,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {item.role}
                                    </div>
                                    <div
                                        style={{
                                            color: TEXT_SECONDARY,
                                            fontSize: 11,
                                            marginTop: 1,
                                        }}
                                    >
                                        {item.company}
                                    </div>
                                </div>
                                <span
                                    style={{
                                        color: TEXT_MUTED,
                                        fontSize: 11,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {formatDate(item.loggedAt)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function StatCard({
    label,
    value,
    color,
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <div
            style={{
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: CARD_BG,
                padding: "10px 6px",
                textAlign: "center",
            }}
        >
            <div
                style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: color || TEXT_PRIMARY,
                    marginBottom: 4,
                }}
            >
                {value}
            </div>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: TEXT_MUTED,
                }}
            >
                {label}
            </div>
        </div>
    );
}

function Dashboard({
    entries,
    onBack,
    onAddManual,
}: {
    entries: LogEntry[];
    onBack: () => void;
    onAddManual: () => void;
}) {
    const [tab, setTab] = useState<"overview" | "recent">("overview");

    const total = entries.length;
    const pending = entries.filter((e) => e.status === "pending").length;
    const errors = entries.filter((e) => e.status === "error").length;
    const logged = entries.filter((e) => e.status === "logged").length;
    const successRate = total > 0 ? Math.round((logged / total) * 100) : 0;

    const displayEntries =
        tab === "overview" ? entries.slice(0, 4) : entries.slice(0, 10);

    return (
        <div style={{ animation: "slideUp 0.25s ease" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                }}
            >
                <button
                    onClick={onBack}
                    aria-label="Back to tracker"
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: `1px solid ${BORDER}`,
                        background: CARD_BG,
                        color: TEXT_SECONDARY,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                    }}
                >
                    <BackArrowIcon size={16} />
                </button>
                <div
                    style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: TEXT_PRIMARY,
                    }}
                >
                    Dashboard
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(["overview", "recent"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            flex: 1,
                            height: 32,
                            borderRadius: 8,
                            border: `1px solid ${tab === t ? ACCENT : BORDER}`,
                            background: tab === t ? ACCENT : CARD_BG,
                            color: tab === t ? "#ffffff" : TEXT_SECONDARY,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        {t === "overview" ? "Overview" : "Recent"}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: 8,
                            marginBottom: 14,
                        }}
                    >
                        <StatCard label="Total" value={String(total)} />
                        <StatCard
                            label="Pending"
                            value={String(pending)}
                            color={pending > 0 ? PENDING : undefined}
                        />
                        <StatCard
                            label="Errors"
                            value={String(errors)}
                            color={errors > 0 ? ERROR : undefined}
                        />
                        <StatCard
                            label="Rate"
                            value={`${successRate}%`}
                            color={successRate >= 80 ? SUCCESS : undefined}
                        />
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 10,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: TEXT_PRIMARY,
                            }}
                        >
                            Recent applications
                        </span>
                        <button
                            onClick={() => setTab("recent")}
                            style={{
                                background: "none",
                                border: "none",
                                color: ACCENT,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            View all →
                        </button>
                    </div>
                </>
            )}

            {tab === "recent" && (
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: TEXT_PRIMARY,
                        marginBottom: 10,
                    }}
                >
                    All recent applications
                </div>
            )}

            {displayEntries.length === 0 ? (
                <div
                    style={{
                        height: 60,
                        borderRadius: 8,
                        border: `1px dashed ${BORDER_STRONG}`,
                        color: TEXT_MUTED,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        background: SURFACE,
                    }}
                >
                    Nothing saved yet
                </div>
            ) : (
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {displayEntries.map((item) => {
                        const statusColor =
                            item.status === "logged"
                                ? SUCCESS
                                : item.status === "pending"
                                  ? PENDING
                                  : ERROR;
                        const statusLabel =
                            item.status === "logged"
                                ? "Logged"
                                : item.status === "pending"
                                  ? "Pending"
                                  : "Error";
                        return (
                            <div
                                key={`${item.status}-${item.company}-${item.role}-${item.loggedAt}`}
                                style={{
                                    minHeight: 44,
                                    borderRadius: 8,
                                    border: `1px solid ${BORDER}`,
                                    background: CARD_BG,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 10px",
                                }}
                            >
                                <JobGlyph
                                    company={item.company}
                                    size={32}
                                    light
                                />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            color: TEXT_PRIMARY,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {item.role}
                                    </div>
                                    <div
                                        style={{
                                            color: TEXT_SECONDARY,
                                            fontSize: 11,
                                            marginTop: 1,
                                        }}
                                    >
                                        {item.company}
                                    </div>
                                </div>
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: statusColor,
                                        background: `${statusColor}15`,
                                        border: `1px solid ${statusColor}25`,
                                        borderRadius: 999,
                                        padding: "2px 6px",
                                        whiteSpace: "nowrap",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.02em",
                                    }}
                                >
                                    {statusLabel}
                                </span>
                                <span
                                    style={{
                                        color: TEXT_MUTED,
                                        fontSize: 11,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {formatDate(item.loggedAt)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <GhostButton onClick={onAddManual} disabled={false}>
                + Add job manually
            </GhostButton>
        </div>
    );
}

export default function App() {
    const [entry, setEntry] = useState<LogEntry | null>(null);
    const [recentEntries, setRecentEntries] = useState<LogEntry[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
    const [trackingStep, setTrackingStep] = useState<TrackingStep>("none");
    const [activeTabUrl, setActiveTabUrl] = useState("");
    const [currentPageJob, setCurrentPageJob] = useState<CurrentPageJob | null>(
        null,
    );
    const [editCompany, setEditCompany] = useState("");
    const [editRole, setEditRole] = useState("");
    const [view, setView] = useState<"track" | "dashboard">("track");
    const [mainTab, setMainTab] = useState<MainTab>("track");

    function rememberEntry(next: LogEntry): void {
        if (isStaleError(next)) return;
        setEntry(next);
        setRecentEntries((prev) => {
            const key = `${next.company}-${next.role}-${next.loggedAt}`;
            const withoutDuplicate = prev.filter(
                (item) =>
                    `${item.company}-${item.role}-${item.loggedAt}` !== key,
            );
            return [next, ...withoutDuplicate].slice(0, 20);
        });
    }

    useEffect(() => {
        let disposed = false;
        let activeController: AbortController | null = null;

        function checkServerHealth(): void {
            chrome.storage.local.get("settings").then((result) => {
                if (disposed) return;
                const stored = result["settings"] as
                    | Partial<ExtensionSettings>
                    | undefined;
                const { mcpUrl, mcpSecret } = {
                    ...DEFAULT_SETTINGS,
                    ...stored,
                };
                const baseUrl = normalizeMcpUrl(mcpUrl);
                const secret = normalizeMcpSecret(mcpSecret);
                const controller = new AbortController();
                activeController = controller;
                const timer = setTimeout(() => controller.abort(), 4000);
                fetch(`${baseUrl}/health`, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${secret}` },
                    signal: controller.signal,
                })
                    .then((res) => {
                        clearTimeout(timer);
                        if (!disposed)
                            setServerStatus(
                                res.status === 401
                                    ? "auth_error"
                                    : res.ok
                                      ? "online"
                                      : "offline",
                            );
                    })
                    .catch(() => {
                        clearTimeout(timer);
                        if (!disposed) setServerStatus("offline");
                    });
            });
        }

        checkServerHealth();
        const interval = window.setInterval(checkServerHealth, 5000);
        return () => {
            disposed = true;
            activeController?.abort();
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        chrome.storage.session.get("lastLogged").then((result) => {
            const raw = result["lastLogged"];
            if (isLogEntry(raw)) rememberEntry(raw);
        });

        const listener = (
            changes: Record<string, chrome.storage.StorageChange>,
            areaName: string,
        ) => {
            if (areaName !== "session") return;
            const change = changes["lastLogged"];
            if (change === undefined) return;
            if (isLogEntry(change.newValue)) rememberEntry(change.newValue);
        };

        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    useEffect(() => {
        chrome.tabs
            .query({ active: true, currentWindow: true })
            .then((tabs) => {
                const tab = tabs[0];
                if (tab?.url !== undefined) setActiveTabUrl(tab.url);
                if (tab?.id === undefined) return;
                chrome.tabs.sendMessage(
                    tab.id,
                    { type: "GET_JOB_INFO" },
                    (response: unknown) => {
                        if (chrome.runtime.lastError) return;
                        if (typeof response !== "object" || response === null)
                            return;
                        const r = response as Record<string, unknown>;
                        const company =
                            typeof r["company"] === "string"
                                ? r["company"]
                                : "";
                        const role =
                            typeof r["role"] === "string" ? r["role"] : "";
                        const url =
                            typeof r["url"] === "string"
                                ? r["url"]
                                : (tab.url ?? "");
                        const sp = isSourcePlatform(r["sourcePlatform"])
                            ? r["sourcePlatform"]
                            : "manual";
                        const jdText =
                            typeof r["jdText"] === "string" ? r["jdText"] : "";

                        if (!company && !role) return;

                        setCurrentPageJob({
                            company,
                            role,
                            url,
                            sourcePlatform: sp,
                            jdText,
                        });
                        setEditCompany(company);
                        setEditRole(role);
                        setTrackingStep(
                            sp !== "manual" ? "tracking" : "prompt",
                        );
                    },
                );
            });
    }, []);

    function startManualTrack(): void {
        const url = currentPageJob?.url || activeTabUrl;
        if (!isTrackableUrl(url)) return;
        const company = currentPageJob?.company || companyFromUrl(url);
        const role = currentPageJob?.role || "";
        setCurrentPageJob({
            company,
            role,
            url,
            sourcePlatform: currentPageJob?.sourcePlatform ?? "manual",
            jdText: currentPageJob?.jdText ?? "",
        });
        setEditCompany(company);
        setEditRole(role);
        setTrackingStep("tracking");
        setEntry(null);
    }

    function handleDoneApplying(): void {
        if (!currentPageJob) return;
        if (!isTrackableUrl(currentPageJob.url)) return;
        const job: DetectedJob = {
            company: editCompany || currentPageJob.company,
            role: editRole || currentPageJob.role,
            url: currentPageJob.url,
            jdText: currentPageJob.jdText,
            sourcePlatform: currentPageJob.sourcePlatform,
        };
        chrome.runtime
            .sendMessage({ type: "JOB_DETECTED", job })
            .catch((err: unknown) => {
                console.error("[popup] handleDoneApplying error:", err);
            });
    }

    if (showSettings) {
        return (
            <>
                <style>{STYLES}</style>
                <Settings onBack={() => setShowSettings(false)} />
            </>
        );
    }

    function renderPrimaryState() {
        if (entry !== null) {
            return (
                <ResultState
                    entry={entry}
                    onViewDashboard={() => setView("dashboard")}
                />
            );
        }

        if (currentPageJob !== null && trackingStep !== "none") {
            return (
                <DetectedState
                    job={currentPageJob}
                    editCompany={editCompany}
                    editRole={editRole}
                    setEditCompany={setEditCompany}
                    setEditRole={setEditRole}
                    onSave={handleDoneApplying}
                    promptOnly={trackingStep === "prompt"}
                    onAccept={() => setTrackingStep("tracking")}
                    onManualTrack={startManualTrack}
                />
            );
        }

        return (
            <IdleState
                onManualTrack={startManualTrack}
                canTrack={isTrackableUrl(activeTabUrl)}
            />
        );
    }

    return (
        <>
            <style>{STYLES}</style>
            <main
                style={{
                    width: 360,
                    minHeight: 300,
                    background: BG,
                    color: TEXT_PRIMARY,
                    padding: 16,
                    fontFamily: FONT,
                    fontSize: 13,
                }}
            >
                {view === "track" ? (
                    <>
                        <Header
                            status={serverStatus}
                            onSettings={() => setShowSettings(true)}
                        />
                        <Divider />
                        <SegmentedControl
                            activeTab={mainTab}
                            onChange={setMainTab}
                        />
                        {mainTab === "track" ? (
                            renderPrimaryState()
                        ) : (
                            <RecentSection entries={recentEntries} />
                        )}
                    </>
                ) : (
                    <Dashboard
                        entries={recentEntries}
                        onBack={() => setView("track")}
                        onAddManual={() => {
                            setView("track");
                            startManualTrack();
                        }}
                    />
                )}
            </main>
        </>
    );
}
