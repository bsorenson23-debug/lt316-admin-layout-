"use client";

import { useState, useEffect } from "react";
import styles from "./LaserTypePanel.module.css";
import type { LaserProfile, LaserLens, LaserSourceType } from "@/types/laserProfile";
import { LASER_SOURCE_LABELS, LASER_SOURCE_COLORS } from "@/types/laserProfile";
import {
  getLaserProfiles, saveLaserProfile, deleteLaserProfile,
  getActiveLaserId, setActiveLaserId, getActiveLensId, setActiveLensId,
} from "@/utils/laserProfileState";
import {
  FLAT_BED_ITEMS,
  FLAT_BED_CATEGORIES,
  FLAT_BED_CATEGORY_LABELS,
  type FlatBedItem,
  type FlatBedCategory,
} from "@/data/flatBedItems";

interface Props {
  onSelectionChange?: (laser: LaserProfile | null, lens: LaserLens | null) => void;
  onItemSelect?: (item: FlatBedItem | null) => void;
}

export function LaserTypePanel({ onSelectionChange, onItemSelect }: Props) {
  const [profiles, setProfiles] = useState<LaserProfile[]>([]);
  const [activeLaserId, setActiveLaserIdState] = useState<string | null>(null);
  const [activeLensId, setActiveLensIdState] = useState<string | null>(null);

  // Load persisted state client-side only to avoid SSR hydration mismatch
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setProfiles(getLaserProfiles());
      setActiveLaserIdState(getActiveLaserId());
      setActiveLensIdState(getActiveLensId());
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingLensId, setEditingLensId] = useState<string | null>(null);

  // Profile draft state
  const [draftName, setDraftName] = useState("");
  const [draftSourceType, setDraftSourceType] = useState<LaserSourceType>("co2");
  const [draftSource, setDraftSource] = useState("");
  const [draftWattage, setDraftWattage] = useState("");
  const [draftIsMopaCapable, setDraftIsMopaCapable] = useState(false);

  // Lens draft state
  const [lDraftName, setLDraftName] = useState("");
  const [lDraftFocal, setLDraftFocal] = useState("");
  const [lDraftKerf, setLDraftKerf] = useState("");
  const [lDraftNotes, setLDraftNotes] = useState("");

  // Flat bed item lookup state
  const [itemCategory, setItemCategory] = useState<FlatBedCategory | "">("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const activeProfile = profiles.find(p => p.id === activeLaserId) ?? null;

  // --- Laser handlers ---

  function handleSelectLaser(id: string) {
    const profile = profiles.find(p => p.id === id) ?? null;
    const firstLens = profile?.lenses[0] ?? null;
    setActiveLaserIdState(id);
    setActiveLaserId(id);
    setActiveLensIdState(firstLens?.id ?? null);
    setActiveLensId(firstLens?.id ?? null);
    onSelectionChange?.(profile, firstLens);
    setEditingProfileId(null);
    setEditingLensId(null);
  }

  function handleSelectLens(id: string) {
    setActiveLensIdState(id);
    setActiveLensId(id);
    const profile = profiles.find(p => p.id === activeLaserId) ?? null;
    const lens = profile?.lenses.find(l => l.id === id) ?? null;
    onSelectionChange?.(profile, lens);
    setEditingLensId(null);
  }

  function handleStartEditProfile(p: LaserProfile) {
    setDraftName(p.name);
    setDraftSourceType(p.sourceType);
    setDraftSource(p.source);
    setDraftWattage(String(p.wattagePeak ?? ""));
    setDraftIsMopaCapable(p.isMopaCapable === true);
    setEditingProfileId(p.id);
  }

  function handleStartNewProfile() {
    setDraftName("");
    setDraftSourceType("co2");
    setDraftSource("");
    setDraftWattage("");
    setDraftIsMopaCapable(false);
    setEditingProfileId("__new__");
  }

  function handleSaveProfile() {
    if (!draftName.trim()) return;

    const isNew = editingProfileId === "__new__";
    const id = isNew ? crypto.randomUUID() : editingProfileId!;

    const existingProfile = profiles.find(p => p.id === id);
    const profile: LaserProfile = {
      id,
      name: draftName.trim(),
      sourceType: draftSourceType,
      source: draftSource.trim(),
      wattagePeak: draftWattage ? Number(draftWattage) : 0,
      isMopaCapable: draftSourceType === "fiber" ? draftIsMopaCapable : false,
      lenses: existingProfile?.lenses ?? [],
    };

    saveLaserProfile(profile);

    setProfiles(prev => {
      if (isNew) return [...prev, profile];
      return prev.map(p => p.id === id ? profile : p);
    });

    if (isNew) {
      setActiveLaserIdState(id);
      setActiveLaserId(id);
      setActiveLensIdState(null);
      setActiveLensId(null);
      onSelectionChange?.(profile, null);
    }

    setEditingProfileId(null);
  }

  function handleDeleteProfile(id: string) {
    deleteLaserProfile(id);
    setProfiles(prev => prev.filter(p => p.id !== id));

    if (activeLaserId === id) {
      setActiveLaserIdState(null);
      setActiveLaserId(null);
      setActiveLensIdState(null);
      setActiveLensId(null);
      onSelectionChange?.(null, null);
    }

    setEditingProfileId(null);
  }

  // --- Lens handlers ---

  function handleStartNewLens() {
    setLDraftName("");
    setLDraftFocal("");
    setLDraftKerf("");
    setLDraftNotes("");
    setEditingLensId("__new__");
  }

  function handleStartEditLens(lens: LaserLens) {
    setLDraftName(lens.name);
    setLDraftFocal(String(lens.focalLengthMm));
    setLDraftKerf(lens.kerfMm != null ? String(lens.kerfMm) : "");
    setLDraftNotes(lens.notes ?? "");
    setEditingLensId(lens.id);
  }

  function handleSaveLens() {
    if (!lDraftName.trim() || !lDraftFocal.trim()) return;
    if (!activeProfile) return;

    const isNew = editingLensId === "__new__";
    const lensId = isNew ? crypto.randomUUID() : editingLensId!;

    const lens: LaserLens = {
      id: lensId,
      name: lDraftName.trim(),
      focalLengthMm: Number(lDraftFocal),
      kerfMm: lDraftKerf ? Number(lDraftKerf) : undefined,
      notes: lDraftNotes.trim() || undefined,
    };

    const updatedLenses = isNew
      ? [...activeProfile.lenses, lens]
      : activeProfile.lenses.map(l => l.id === lensId ? lens : l);

    const updatedProfile: LaserProfile = { ...activeProfile, lenses: updatedLenses };
    saveLaserProfile(updatedProfile);
    setProfiles(prev => prev.map(p => p.id === activeProfile.id ? updatedProfile : p));

    if (isNew) {
      setActiveLensIdState(lensId);
      setActiveLensId(lensId);
      onSelectionChange?.(updatedProfile, lens);
    }

    setEditingLensId(null);
  }

  function handleDeleteLens(lensId: string) {
    if (!activeProfile) return;

    const updatedLenses = activeProfile.lenses.filter(l => l.id !== lensId);
    const updatedProfile: LaserProfile = { ...activeProfile, lenses: updatedLenses };
    saveLaserProfile(updatedProfile);
    setProfiles(prev => prev.map(p => p.id === activeProfile.id ? updatedProfile : p));

    if (activeLensId === lensId) {
      setActiveLensIdState(null);
      setActiveLensId(null);
      onSelectionChange?.(updatedProfile, null);
    }
  }

  return (
    <div className={styles.panel}>

      {/* === LASER PROFILES SECTION === */}
      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Laser Profiles</span>
          <button className={styles.addBtn} onClick={handleStartNewProfile}>+ Add</button>
        </div>

        {profiles.length === 0 && editingProfileId !== "__new__" && (
          <div className={styles.empty}>No lasers added yet.</div>
        )}
        <div className={styles.pillRow}>
          {profiles.map(p => (
            <button
              key={p.id}
              className={`${styles.laserPill} ${activeLaserId === p.id ? styles.laserPillActive : ""}`}
              onClick={() => handleSelectLaser(p.id)}
              title={`${p.source} · ${p.wattagePeak}W`}
            >
              <span
                className={styles.laserPillBadge}
                style={{ background: LASER_SOURCE_COLORS[p.sourceType] }}
              >
                {LASER_SOURCE_LABELS[p.sourceType]}
              </span>
              <span className={styles.laserPillName}>{p.name}</span>
              <button
                className={styles.pillEditBtn}
                onClick={e => { e.stopPropagation(); handleStartEditProfile(p); }}
                title="Edit profile"
              >✎</button>
            </button>
          ))}
        </div>

        {/* Edit/Create form — shown when editingProfileId is set */}
        {editingProfileId !== null && (
          <div className={styles.editForm}>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>Name</span>
                <input
                  className={styles.textInput}
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  placeholder="e.g. Main CO2"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>Type</span>
                <select
                  className={styles.selectInput}
                  value={draftSourceType}
                  onChange={e => setDraftSourceType(e.target.value as LaserSourceType)}
                >
                  {(Object.entries(LASER_SOURCE_LABELS) as [LaserSourceType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formField}>
                <span>Wattage (W)</span>
                <input
                  className={styles.numInput}
                  type="number"
                  min={1}
                  max={5000}
                  value={draftWattage}
                  onChange={e => setDraftWattage(e.target.value)}
                  placeholder="e.g. 80"
                />
              </label>
            </div>
              <label className={styles.formField}>
                <span>Source / Manufacturer</span>
                <input
                  className={styles.textInput}
                  value={draftSource}
                onChange={e => setDraftSource(e.target.value)}
                  placeholder="e.g. RECI W2, xTool D1 Pro"
                />
              </label>
              {draftSourceType === "fiber" && (
                <label className={styles.formField}>
                  <span>Fiber pulse control</span>
                  <select
                    className={styles.selectInput}
                    value={draftIsMopaCapable ? "mopa" : "standard"}
                    onChange={e => setDraftIsMopaCapable(e.target.value === "mopa")}
                  >
                    <option value="standard">Standard fiber</option>
                    <option value="mopa">MOPA fiber</option>
                  </select>
                </label>
              )}
            <div className={styles.formActions}>
              <button className={styles.saveBtn} onClick={handleSaveProfile} disabled={!draftName.trim()}>Save</button>
              {editingProfileId !== "__new__" && (
                <button className={styles.deleteBtn} onClick={() => handleDeleteProfile(editingProfileId)}>Delete</button>
              )}
              <button className={styles.cancelBtn} onClick={() => setEditingProfileId(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* === LENSES SECTION — only shown when a laser is active === */}
      {activeProfile && (
        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Lenses — {activeProfile.name}</span>
            <button className={styles.addBtn} onClick={handleStartNewLens}>+ Add</button>
          </div>

          {activeProfile.lenses.length === 0 && editingLensId !== "__new__" && (
            <div className={styles.empty}>No lenses added for this laser.</div>
          )}
          <div className={styles.pillRow}>
            {activeProfile.lenses.map(lens => (
              <button
                key={lens.id}
                className={`${styles.lensPill} ${activeLensId === lens.id ? styles.lensPillActive : ""}`}
                onClick={() => handleSelectLens(lens.id)}
                title={`Focal: ${lens.focalLengthMm}mm${lens.kerfMm ? ` · Kerf: ${lens.kerfMm}mm` : ""}`}
              >
                <span className={styles.lensPillLabel}>{lens.name}</span>
                <button
                  className={styles.pillEditBtn}
                  onClick={e => { e.stopPropagation(); handleStartEditLens(lens); }}
                  title="Edit lens"
                >✎</button>
              </button>
            ))}
          </div>

          {/* Lens edit/create form */}
          {editingLensId !== null && (
            <div className={styles.editForm}>
              <label className={styles.formField}>
                <span>Lens Name</span>
                <input
                  className={styles.textInput}
                  value={lDraftName}
                  onChange={e => setLDraftName(e.target.value)}
                  placeholder='e.g. "100mm Standard"'
                />
              </label>
              <div className={styles.formRow}>
                <label className={styles.formField}>
                  <span>Focal Length (mm)</span>
                  <input
                    className={styles.numInput}
                    type="number"
                    min={1}
                    value={lDraftFocal}
                    onChange={e => setLDraftFocal(e.target.value)}
                    placeholder="100"
                  />
                </label>
                <label className={styles.formField}>
                  <span>Kerf (mm)</span>
                  <input
                    className={styles.numInput}
                    type="number"
                    min={0}
                    step={0.01}
                    value={lDraftKerf}
                    onChange={e => setLDraftKerf(e.target.value)}
                    placeholder="0.12"
                  />
                </label>
              </div>
              <label className={styles.formField}>
                <span>Notes (optional)</span>
                <input
                  className={styles.textInput}
                  value={lDraftNotes}
                  onChange={e => setLDraftNotes(e.target.value)}
                  placeholder="e.g. Best for fine detail work"
                />
              </label>
              <div className={styles.formActions}>
                <button
                  className={styles.saveBtn}
                  onClick={handleSaveLens}
                  disabled={!lDraftName.trim() || !lDraftFocal.trim()}
                >Save</button>
                {editingLensId !== "__new__" && (
                  <button className={styles.deleteBtn} onClick={() => handleDeleteLens(editingLensId)}>Delete</button>
                )}
                <button className={styles.cancelBtn} onClick={() => setEditingLensId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}
      {/* === FLAT BED ITEM LOOKUP === */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Flat Bed Item Lookup</div>

        {/* Category filter */}
        <div className={styles.categoryRow}>
          <button
            className={`${styles.catBtn} ${itemCategory === "" ? styles.catBtnActive : ""}`}
            onClick={() => { setItemCategory(""); setSelectedItemId(""); onItemSelect?.(null); }}
          >All</button>
          {FLAT_BED_CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`${styles.catBtn} ${itemCategory === cat ? styles.catBtnActive : ""}`}
              onClick={() => { setItemCategory(cat); setSelectedItemId(""); onItemSelect?.(null); }}
            >
              {FLAT_BED_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Item select */}
        <select
          className={styles.selectInput}
          value={selectedItemId}
          onChange={e => {
            const id = e.target.value;
            setSelectedItemId(id);
            const item = FLAT_BED_ITEMS.find(i => i.id === id) ?? null;
            onItemSelect?.(item);
          }}
        >
          <option value="">— Select item —</option>
          {FLAT_BED_ITEMS
            .filter(i => !itemCategory || i.category === itemCategory)
            .map(i => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))
          }
        </select>
      </section>
    </div>
  );
}
