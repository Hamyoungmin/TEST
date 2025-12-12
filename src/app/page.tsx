"use client";

import { useState, useCallback, DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type ExcelRow = (string | number | boolean | null)[];

export default function Home() {
  const [data, setData] = useState<ExcelRow[]>([]);
  const [allData, setAllData] = useState<ExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const processExcelFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        setError("워크시트를 찾을 수 없습니다.");
        setIsLoading(false);
        return;
      }

      const rows: ExcelRow[] = [];
      const headerRow: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        const rowData: ExcelRow = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const value = cell.value;
          if (rowNumber === 1) {
            headerRow[colNumber - 1] = String(value ?? `Column ${colNumber}`);
          }
          if (typeof value === "object" && value !== null) {
            if ("result" in value) {
              rowData.push(value.result as string | number | boolean | null);
            } else if ("text" in value) {
              rowData.push((value as { text: string }).text);
            } else {
              rowData.push(String(value));
            }
          } else {
            rowData.push(value as string | number | boolean | null);
          }
        });
        if (rowNumber > 1) {
          rows.push(rowData);
        }
      });

      setHeaders(headerRow);
      setAllData(rows);
      setData(rows.slice(0, 5));
      setFileName(file.name);
    } catch (err) {
      console.error(err);
      setError("파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (data.length === 0 || headers.length === 0) {
      setError("저장할 데이터가 없습니다.");
      return;
    }

    setIsUploading(true);
    setError("");
    setSuccessMessage("");

    try {
      const formattedData = data.map((row) => {
        const rowObj: Record<string, string | number | boolean | null> = {};
        headers.forEach((header, index) => {
          rowObj[header] = row[index] ?? null;
        });
        return {
          file_name: fileName,
          row_data: rowObj,
        };
      });

      const { error: saveError } = await supabase.from("재고").insert(formattedData);

      if (saveError) {
        console.error("Supabase error:", saveError);
        setError(`저장 실패: ${saveError.message}`);
      } else {
        setSuccessMessage("데이터가 성공적으로 DB에 저장되었습니다!");
      }
    } catch (err) {
      console.error("Save error:", err);
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processExcelFile(file);
    }
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const resetUpload = () => {
    setData([]);
    setAllData([]);
    setHeaders([]);
    setFileName("");
    setError("");
    setSuccessMessage("");
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.glowOrb}></div>
        <div className={styles.glowOrb2}></div>

        {/* Header with Navigation */}
        <header className={styles.header}>
          <div className={styles.logo}>📊 재고 관리 시스템</div>
          <Link href="/management" className={styles.navButton}>
            🗄️ DB 저장 데이터 관리 →
          </Link>
        </header>

        <div className={styles.content}>
          {/* Top Section - Upload & Preview Side by Side */}
          <div className={styles.topSection}>
            {/* Upload Card */}
            <div className={styles.uploadCard}>
              <h2 className={styles.uploadCardTitle}>📁 엑셀 파일 업로드</h2>
              
              <div
                className={`${styles.uploadZone} ${isDragging ? styles.dragging : ""} ${fileName ? styles.hasFile : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className={styles.fileInput}
                  id="fileInput"
                />

                {isLoading ? (
                  <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p>파일을 읽는 중...</p>
                  </div>
                ) : fileName ? (
                  <div className={styles.fileInfo}>
                    <div className={styles.fileIcon}>✅</div>
                    <p className={styles.fileName}>{fileName}</p>
                    <p className={styles.fileStats}>총 {allData.length}개 행</p>
                    <button onClick={resetUpload} className={styles.resetButton}>
                      다른 파일 선택
                    </button>
                  </div>
                ) : (
                  <label htmlFor="fileInput" className={styles.uploadLabel}>
                    <div className={styles.uploadIcon}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className={styles.uploadText}>
                      드래그하거나 <span>클릭</span>
                    </p>
                    <p className={styles.uploadHint}>.xlsx, .xls 지원</p>
                  </label>
                )}
              </div>

              {/* Messages */}
              <div className={styles.messagesArea}>
                {error && (
                  <div className={styles.errorMessage}>
                    <span>⚠️</span> {error}
                  </div>
                )}
                {successMessage && (
                  <div className={styles.successMessage}>{successMessage}</div>
                )}
                {fileName && allData.length === 0 && (
                  <div className={styles.warningMessage}>
                    <span>📭</span> 데이터가 없습니다.
                  </div>
                )}
              </div>

              {/* Save Button */}
              {data.length > 0 && (
                <div className={styles.uploadActions}>
                  <button
                    onClick={handleSaveToDatabase}
                    disabled={isUploading || data.length === 0}
                    className={styles.uploadButton}
                  >
                    {isUploading ? (
                      <>
                        <div className={styles.buttonSpinner}></div>
                        저장 중...
                      </>
                    ) : (
                      <>💾 DB에 저장 ({data.length}개)</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Preview Card */}
            <div className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <h2 className={styles.previewTitle}>📋 엑셀 미리보기</h2>
                {data.length > 0 && (
                  <span className={styles.rowCount}>
                    전체 {allData.length}개 중 {data.length}개 표시
                  </span>
                )}
              </div>

              {data.length > 0 ? (
                <div className={styles.tableSection}>
                  <div className={styles.tableWrapper}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th className={styles.indexColumn}>#</th>
                          {headers.map((header, index) => (
                            <th key={index}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            <td className={styles.indexColumn}>{rowIndex + 1}</td>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex}>
                                {cell !== null && cell !== undefined ? String(cell) : "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyPreview}>
                  <span style={{ fontSize: "3rem" }}>📄</span>
                  <p>엑셀 파일을 업로드하면 미리보기가 표시됩니다</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <p>재고 관리 시스템 with Supabase</p>
        </footer>
      </div>
    </main>
  );
}
