"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

interface DbRecord {
  id: number;
  created_at: string;
  file_name: string;
  row_data: Record<string, string | number | boolean | null>;
}

export default function EditPage() {
  const params = useParams();
  const fileId = params.fileId as string;

  const [records, setRecords] = useState<DbRecord[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [editingCell, setEditingCell] = useState<{ rowId: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // fileId에 해당하는 데이터 불러오기
  const fetchData = async () => {
    setIsLoading(true);
    setError("");

    try {
      // fileId를 file_name으로 사용 (URL 인코딩된 파일명)
      const decodedFileName = decodeURIComponent(fileId);
      setFileName(decodedFileName);

      const { data, error: fetchError } = await supabase
        .from("재고")
        .select("*")
        .eq("file_name", decodedFileName)
        .order("id", { ascending: true });

      if (fetchError) {
        setError(`데이터 불러오기 실패: ${fetchError.message}`);
      } else if (data && data.length > 0) {
        // 중복 제거: ID 기준으로 고유한 레코드만 유지
        const uniqueRecords = data.reduce((acc: DbRecord[], current) => {
          const isDuplicate = acc.find((item) => item.id === current.id);
          if (!isDuplicate) {
            acc.push(current as DbRecord);
          }
          return acc;
        }, []);

        setRecords(uniqueRecords);

        // 모든 레코드에서 실제 데이터가 있는 헤더만 추출
        const allHeaders = new Set<string>();
        const headersWithData = new Set<string>();

        uniqueRecords.forEach((record) => {
          if (record.row_data) {
            Object.entries(record.row_data).forEach(([key, value]) => {
              allHeaders.add(key);
              // 실제 데이터가 있는 컬럼만 추가 (null, undefined, 빈 문자열이 아닌 경우)
              if (value !== null && value !== undefined && String(value).trim() !== "") {
                headersWithData.add(key);
              }
            });
          }
        });

        // 데이터가 있는 헤더만 필터링하고, 원래 순서 유지 (LTR 정렬)
        const firstRecord = uniqueRecords[0];
        const orderedHeaders = firstRecord.row_data 
          ? Object.keys(firstRecord.row_data).filter((h) => headersWithData.has(h))
          : [];

        setHeaders(orderedHeaders);
      } else {
        setError("해당 파일의 데이터가 없습니다.");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (fileId) {
      fetchData();
    }
  }, [fileId]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // 셀 클릭 시 편집 모드
  const handleCellClick = (rowId: number, colKey: string, value: string | number | boolean | null) => {
    setEditingCell({ rowId, colKey });
    setEditValue(value !== null && value !== undefined ? String(value) : "");
  };

  // 셀 수정 후 DB 업데이트
  const handleCellUpdate = async () => {
    if (!editingCell) return;

    const { rowId, colKey } = editingCell;
    const record = records.find((r) => r.id === rowId);
    if (!record) {
      setEditingCell(null);
      return;
    }

    const oldValue = record.row_data[colKey];
    if (String(oldValue ?? "") === editValue) {
      setEditingCell(null);
      return;
    }

    try {
      const updatedRowData = {
        ...record.row_data,
        [colKey]: editValue,
      };

      const { error: updateError } = await supabase
        .from("재고")
        .update({ row_data: updatedRowData })
        .eq("id", rowId);

      if (updateError) {
        setError(`저장 실패: ${updateError.message}`);
      } else {
        // 로컬 상태 업데이트
        setRecords((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, row_data: updatedRowData } : r))
        );
        setSuccessMessage("저장됨");
        setTimeout(() => setSuccessMessage(""), 1500);
      }
    } catch (err) {
      console.error("Update error:", err);
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setEditingCell(null);
    }
  };

  // 키보드 이벤트 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellUpdate();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleCellUpdate();
    }
  };

  // 셀 외부 클릭 시 저장
  const handleBlur = () => {
    handleCellUpdate();
  };

  return (
    <main className={styles.main}>
      <div className={styles.glowOrb}></div>
      <div className={styles.glowOrb2}></div>

      {/* Toolbar */}
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/management" className={styles.backButton}>
            ← 목록
          </Link>
          <div className={styles.fileInfo}>
            <span className={styles.fileIcon}>📄</span>
            <h1 className={styles.fileName}>{fileName || "로딩 중..."}</h1>
          </div>
        </div>
        <div className={styles.toolbarCenter}>
          {successMessage && <span className={styles.saveIndicator}>✓ {successMessage}</span>}
          {error && <span className={styles.errorIndicator}>⚠ {error}</span>}
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.recordCount}>{records.length}개 행</span>
          <button onClick={fetchData} className={styles.refreshBtn}>
            🔄 새로고침
          </button>
        </div>
      </header>

      {/* Excel-like Grid - LTR Layout */}
      <div className={styles.gridContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : records.length > 0 && headers.length > 0 ? (
          <div className={styles.gridWrapper}>
            <table className={styles.excelGrid} dir="ltr">
              <thead>
                <tr>
                  <th className={styles.rowHeader}></th>
                  {headers.map((header, idx) => (
                    <th key={header} className={styles.colHeader}>
                      <span className={styles.colLetter}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className={styles.colName}>{header}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record, rowIdx) => (
                  <tr key={record.id}>
                    <td className={styles.rowHeader}>{rowIdx + 1}</td>
                    {headers.map((header) => {
                      const isEditing =
                        editingCell?.rowId === record.id && editingCell?.colKey === header;
                      const cellValue = record.row_data[header];

                      return (
                        <td
                          key={`${record.id}-${header}`}
                          className={`${styles.cell} ${isEditing ? styles.editing : ""}`}
                          onClick={() => !isEditing && handleCellClick(record.id, header, cellValue)}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleBlur}
                              className={styles.cellInput}
                            />
                          ) : (
                            <span className={styles.cellContent}>
                              {cellValue !== null && cellValue !== undefined
                                ? String(cellValue)
                                : ""}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <h2>데이터가 없습니다</h2>
            <p>해당 파일의 데이터를 찾을 수 없습니다.</p>
            <Link href="/management" className={styles.backLink}>
              ← 목록으로 돌아가기
            </Link>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <footer className={styles.statusBar}>
        <span>파일: {fileName}</span>
        <span>행: {records.length}</span>
        <span>열: {headers.length}</span>
        {editingCell && <span>편집 중: {editingCell.colKey}</span>}
      </footer>
    </main>
  );
}
