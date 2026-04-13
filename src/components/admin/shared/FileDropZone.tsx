"use client";

import React from "react";
import styles from "./FileDropZone.module.css";

interface FileDropZoneProps {
  accept?: string;
  fileName?: string | null;
  label?: string;
  hint?: string;
  inputTestId?: string;
  dropZoneTestId?: string;
  onFileSelected: (file: File) => void;
  onClear: () => void;
}

export function FileDropZone({
  accept = "image/*",
  fileName,
  label,
  hint,
  inputTestId,
  dropZoneTestId,
  onFileSelected,
  onClear,
}: FileDropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  if (fileName) {
    return (
      <div className={styles.selected}>
        <span className={styles.selectedName} title={fileName}>
          {fileName}
        </span>
        <button
          type="button"
          className={styles.clearBtn}
          onClick={onClear}
          aria-label="Clear selected file"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        data-testid={inputTestId}
        className={styles.hiddenInput}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        data-testid={dropZoneTestId}
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneDragOver : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className={styles.prompt}>{label ?? "Click to upload or drag image here"}</span>
        <span className={styles.subtext}>{hint ?? "JPG, PNG, AVIF, WEBP"}</span>
      </div>
    </div>
  );
}
