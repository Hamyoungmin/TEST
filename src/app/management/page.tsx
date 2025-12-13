"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

interface DbRecord {
  id: number;
  created_at: string;
  file_name: string;
  row_data: Record<string, string | number | boolean | null>;
}

export default function ManagementPage() {
  const [dbData, setDbData] = useState<DbRecord[]>([]);
  const [dbHeaders, setDbHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const fetchDbData = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data: records, error: fetchError } = await supabase
        .from("재고")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        setError(`데이터 불러오기 실패: ${fetchError.message}`);
      } else if (records) {
        setDbData(records as DbRecord[]);
        if (records.length > 0 && records[0].row_data) {
          setDbHeaders(Object.keys(records[0].row_data));
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbData();
  }, []);

  const handleCellClick = (id: number, key: string, currentValue: string | number | boolean | null) => {
    setEditingCell({ id, key });
    setEditValue(currentValue !== null && currentValue !== undefined ? String(currentValue) : "");
  };

  const handleCellUpdate = async (id: number, key: string) => {
    const record = dbData.find((r) => r.id === id);
    if (!record) return;

    const oldValue = record.row_data[key];
    if (String(oldValue ?? "") === editValue) {
      setEditingCell(null);
      return;
    }

    try {
      const updatedRowData = {
        ...record.row_data,
        [key]: editValue,
      };

      const { error: updateError } = await supabase
        .from("재고")
        .update({ row_data: updatedRowData })
        .eq("id", id);

      if (updateError) {
        setError(`업데이트 실패: ${updateError.message}`);
      } else {
        setDbData((prev) =>
          prev.map((r) => (r.id === id ? { ...r, row_data: updatedRowData } : r))
        );
        setSuccessMessage("저장 성공!");
        setTimeout(() => setSuccessMessage(""), 2000);
      }
    } catch (err) {
      console.error("Update error:", err);
      setError("업데이트 중 오류가 발생했습니다.");
    } finally {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number, key: string) => {
    if (e.key === "Enter") {
      handleCellUpdate(id, key);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.glowOrb}></div>
      <div className={styles.glowOrb2}></div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backButton}>
            ← 엑셀 업로드
          </Link>
          <h1 className={styles.title}>🗄️ DB 데이터 관리</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.dataCount}>총 {dbData.length}개 데이터</span>
          <button onClick={fetchDbData} className={styles.refreshButton}>
            🔄 새로고침
          </button>
        </div>
      </header>

      {/* Messages */}
      {error && (
        <div className={styles.errorMessage}>
          <span>⚠️</span> {error}
          <button onClick={() => setError("")} className={styles.closeBtn}>×</button>
        </div>
      )}
      {successMessage && (
        <div className={styles.successMessage}>✅ {successMessage}</div>
      )}

      {/* Full Screen Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : dbData.length > 0 ? (
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.idColumn}>ID</th>
                  <th className={styles.fileColumn}>파일명</th>
                  <th className={styles.dateColumn}>생성일</th>
                  {dbHeaders.map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbData.map((record) => (
                  <tr key={record.id}>
                    <td className={styles.idColumn}>{record.id}</td>
                    <td className={styles.fileColumn}>
                      <Link 
                        href={`/management/${encodeURIComponent(record.file_name)}/edit`}
                        className={styles.fileLink}
                      >
                        📄 {record.file_name}
                      </Link>
                    </td>
                    <td className={styles.dateColumn}>
                      {new Date(record.created_at).toLocaleString("ko-KR")}
                    </td>
                    {dbHeaders.map((header) => (
                      <td
                        key={header}
                        className={styles.editableCell}
                        onClick={() => handleCellClick(record.id, header, record.row_data[header])}
                      >
                        {editingCell?.id === record.id && editingCell?.key === header ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellUpdate(record.id, header)}
                            onKeyDown={(e) => handleKeyDown(e, record.id, header)}
                            className={styles.cellInput}
                            autoFocus
                          />
                        ) : (
                          <span className={styles.cellValue}>
                            {record.row_data[header] !== null && record.row_data[header] !== undefined
                              ? String(record.row_data[header])
                              : "-"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <h2>저장된 데이터가 없습니다</h2>
            <p>엑셀 파일을 업로드하여 데이터를 추가하세요.</p>
            <Link href="/" className={styles.uploadLink}>
              📤 엑셀 업로드하러 가기
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
