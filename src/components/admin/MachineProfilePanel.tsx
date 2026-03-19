"use client";

import React from "react";
import type { MachineProfile, RotaryAxis } from "@/types/machine";
import { MACHINE_PROFILES_KEY, ACTIVE_MACHINE_ID_KEY } from "@/types/machine";
import { LASER_TYPE_LABELS } from "@/types/materials";
import type { LaserType } from "@/types/materials";
import styles from "./MachineProfilePanel.module.css";

function loadMachines(): MachineProfile[] {
  try { return JSON.parse(localStorage.getItem(MACHINE_PROFILES_KEY) ?? "[]") as MachineProfile[]; }
  catch { return []; }
}
function saveMachines(machines: MachineProfile[]) {
  try { localStorage.setItem(MACHINE_PROFILES_KEY, JSON.stringify(machines)); } catch { /* noop */ }
}
function loadActiveId(): string {
  try { return localStorage.getItem(ACTIVE_MACHINE_ID_KEY) ?? ""; } catch { return ""; }
}
function saveActiveId(id: string) {
  try { localStorage.setItem(ACTIVE_MACHINE_ID_KEY, id); } catch { /* noop */ }
}

type MachineFormDraft = {
  name: string;
  laserType: LaserType;
  wattagePeak: string;
  bedWidthMm: string;
  bedHeightMm: string;
  rotaryAxis: RotaryAxis;
  notes: string;
};

const EMPTY_DRAFT: MachineFormDraft = {
  name: "",
  laserType: "co2",
  wattagePeak: "",
  bedWidthMm: "300",
  bedHeightMm: "300",
  rotaryAxis: "Y",
  notes: "",
};

const LASER_TYPE_KEYS = Object.keys(LASER_TYPE_LABELS) as LaserType[];

export interface ActiveMachineProfile {
  id: string;
  name: string;
  laserType: LaserType;
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryAxis: RotaryAxis;
}

interface Props {
  onMachineChange?: (machine: ActiveMachineProfile | null) => void;
}

export function MachineProfilePanel({ onMachineChange }: Props) {
  const [open, setOpen] = React.useState(true);
  const [machines, setMachines] = React.useState<MachineProfile[]>(() => loadMachines());
  const [activeId, setActiveId] = React.useState<string>(() => loadActiveId());
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<MachineFormDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const activeMachine = machines.find((m) => m.id === activeId) ?? null;

  React.useEffect(() => {
    if (!onMachineChange) return;
    if (!activeMachine) { onMachineChange(null); return; }
    onMachineChange({
      id: activeMachine.id,
      name: activeMachine.name,
      laserType: activeMachine.laserType,
      bedWidthMm: activeMachine.bedWidthMm,
      bedHeightMm: activeMachine.bedHeightMm,
      rotaryAxis: activeMachine.rotaryAxis,
    });
  }, [activeMachine, onMachineChange]);

  const persist = (next: MachineProfile[]) => {
    setMachines(next);
    saveMachines(next);
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    saveActiveId(id);
  };

  const handleSave = () => {
    const wattage = Number(draft.wattagePeak);
    const bedW    = Number(draft.bedWidthMm);
    const bedH    = Number(draft.bedHeightMm);
    if (!draft.name.trim() || !wattage || !bedW || !bedH) return;

    if (editingId) {
      persist(machines.map((m) => m.id !== editingId ? m : {
        ...m,
        name: draft.name.trim(),
        laserType: draft.laserType,
        wattagePeak: wattage,
        bedWidthMm: bedW,
        bedHeightMm: bedH,
        rotaryAxis: draft.rotaryAxis,
        notes: draft.notes.trim() || undefined,
      }));
      setEditingId(null);
    } else {
      const newMachine: MachineProfile = {
        id: `machine-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: draft.name.trim(),
        laserType: draft.laserType,
        wattagePeak: wattage,
        bedWidthMm: bedW,
        bedHeightMm: bedH,
        rotaryAxis: draft.rotaryAxis,
        bedOrigin: "top-left",
        notes: draft.notes.trim() || undefined,
      };
      const next = [...machines, newMachine];
      persist(next);
      if (!activeId) handleSelect(newMachine.id);
    }
    setCreating(false);
    setDraft(EMPTY_DRAFT);
  };

  const handleEdit = (m: MachineProfile) => {
    setDraft({
      name: m.name,
      laserType: m.laserType,
      wattagePeak: String(m.wattagePeak),
      bedWidthMm: String(m.bedWidthMm),
      bedHeightMm: String(m.bedHeightMm),
      rotaryAxis: m.rotaryAxis,
      notes: m.notes ?? "",
    });
    setEditingId(m.id);
    setCreating(true);
  };

  const handleDelete = (id: string) => {
    const next = machines.filter((m) => m.id !== id);
    persist(next);
    if (activeId === id) { setActiveId(""); saveActiveId(""); }
  };

  const upd = (k: keyof MachineFormDraft, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)} type="button">
        <span className={styles.toggleLabel}>
          Machine Profile
          {activeMachine && <span className={styles.activeDot} title={activeMachine.name} />}
        </span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {machines.length === 0 && !creating && (
            <div className={styles.empty}>No machines configured. Add your laser to pre-fill export settings.</div>
          )}

          {machines.map((m) => (
            <div
              key={m.id}
              className={`${styles.machineCard} ${m.id === activeId ? styles.machineCardActive : ""}`}
              onClick={() => handleSelect(m.id)}
            >
              <div className={styles.machineCardRow}>
                <span className={styles.machineName}>{m.name}</span>
                <span className={styles.machineType}>{LASER_TYPE_LABELS[m.laserType]} · {m.wattagePeak}W</span>
              </div>
              <div className={styles.machineCardSub}>
                {m.bedWidthMm}×{m.bedHeightMm} mm · {m.rotaryAxis}-axis rotary
                {m.id === activeId && <span className={styles.activeLabel}> · Active</span>}
              </div>
              <div className={styles.machineCardBtns}>
                <button className={styles.tinyBtn} onClick={(e) => { e.stopPropagation(); handleEdit(m); }}>Edit</button>
                <button className={styles.tinyBtnDanger} onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>×</button>
              </div>
            </div>
          ))}

          {!creating && (
            <button className={styles.addBtn} onClick={() => { setDraft(EMPTY_DRAFT); setEditingId(null); setCreating(true); }}>
              + Add Machine
            </button>
          )}

          {creating && (
            <div className={styles.form}>
              <input className={styles.input} placeholder="Machine name (e.g. xTool P2 60W)" value={draft.name} onChange={(e) => upd("name", e.target.value)} />
              <div className={styles.formRow}>
                <select className={styles.select} value={draft.laserType} onChange={(e) => upd("laserType", e.target.value)}>
                  {LASER_TYPE_KEYS.map((k) => <option key={k} value={k}>{LASER_TYPE_LABELS[k]}</option>)}
                </select>
                <input className={styles.numInput} type="number" placeholder="Watts" value={draft.wattagePeak} onChange={(e) => upd("wattagePeak", e.target.value)} />
                <span className={styles.unit}>W</span>
              </div>
              <div className={styles.formRow}>
                <input className={styles.numInput} type="number" placeholder="Bed W" value={draft.bedWidthMm} onChange={(e) => upd("bedWidthMm", e.target.value)} />
                <span className={styles.unit}>×</span>
                <input className={styles.numInput} type="number" placeholder="Bed H" value={draft.bedHeightMm} onChange={(e) => upd("bedHeightMm", e.target.value)} />
                <span className={styles.unit}>mm</span>
              </div>
              <div className={styles.formRow}>
                <span className={styles.fieldLabel}>Rotary axis</span>
                {(["Y", "A"] as RotaryAxis[]).map((ax) => (
                  <label key={ax} className={styles.radioLabel}>
                    <input type="radio" name="rotaryAxis" value={ax} checked={draft.rotaryAxis === ax} onChange={() => upd("rotaryAxis", ax)} />
                    {ax}
                  </label>
                ))}
              </div>
              <input className={styles.input} placeholder="Notes (optional)" value={draft.notes} onChange={(e) => upd("notes", e.target.value)} />
              <div className={styles.formBtns}>
                <button className={styles.saveBtn} onClick={handleSave}>
                  {editingId ? "Update" : "Save Machine"}
                </button>
                <button className={styles.cancelBtn} onClick={() => { setCreating(false); setEditingId(null); setDraft(EMPTY_DRAFT); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
