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
  isNew?: boolean;
}

// 헤더 이름 정리 함수 (A1: 이름 → 이름)
const cleanHeaderName = (header: string): string => {
  const colonIndex = header.indexOf(":");
  if (colonIndex !== -1 && colonIndex < 4) {
    return header.substring(colonIndex + 1).trim();
  }
  return header.trim();
};

// 불필요한 컬럼인지 확인
const isValidColumn = (header: string, records: DbRecord[]): boolean => {
  const cleanName = cleanHeaderName(header);
  
  if (/^column\s*\d+$/i.test(cleanName)) {
    return false;
  }
  
  if (!cleanName || cleanName.trim() === "") {
    return false;
  }
  
  const hasData = records.some((record) => {
    const value = record.row_data[header];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
  
  return hasData;
};

// 새 행을 위한 임시 ID 생성 (음수값 사용)
let tempIdCounter = -1;
const generateTempId = () => {
  return tempIdCounter--;
};

export default function EditPage() {
  const params = useParams();
  const fileId = params.fileId as string;

  const [records, setRecords] = useState<DbRecord[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [displayHeaders, setDisplayHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [editingCell, setEditingCell] = useState<{ rowId: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 열 추가 모달 상태
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const columnInputRef = useRef<HTMLInputElement>(null);

  // fileId에 해당하는 데이터 불러오기
  const fetchData = async () => {
    setIsLoading(true);
    setError("");

    try {
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
        const uniqueRecords = data.reduce((acc: DbRecord[], current) => {
          const isDuplicate = acc.find((item) => item.id === current.id);
          if (!isDuplicate) {
            acc.push(current as DbRecord);
          }
          return acc;
        }, []);

        setRecords(uniqueRecords);

        // 모든 레코드에서 헤더 수집
        const allHeadersSet = new Set<string>();
        uniqueRecords.forEach((record) => {
          if (record.row_data) {
            Object.keys(record.row_data).forEach((key) => allHeadersSet.add(key));
          }
        });

        const allHeaders = Array.from(allHeadersSet);
        
        // 유효한 컬럼만 필터링 (데이터가 있고, Column X 패턴이 아닌 것)
        const validHeaders = allHeaders.filter((h) => {
          const cleanName = cleanHeaderName(h);
          
          // Column X 패턴은 제외 (대소문자 무관)
          if (/^column\s*\d+$/i.test(cleanName)) {
            return false;
          }
          
          // 빈 헤더명은 제외
          if (!cleanName || cleanName.trim() === "") {
            return false;
          }
          
          // 해당 컬럼에 실제 데이터가 있는지 확인
          const hasData = uniqueRecords.some((record) => {
            const value = record.row_data[h];
            return value !== null && value !== undefined && String(value).trim() !== "";
          });
          
          return hasData;
        });
        
        setHeaders(validHeaders);
        setDisplayHeaders(validHeaders.map(cleanHeaderName));
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

  useEffect(() => {
    if (showAddColumnModal && columnInputRef.current) {
      columnInputRef.current.focus();
    }
  }, [showAddColumnModal]);

  // 새 행 추가
  const handleAddRow = () => {
    const emptyRowData: Record<string, string | number | boolean | null> = {};
    headers.forEach((header) => {
      emptyRowData[header] = "";
    });

    const newRecord: DbRecord = {
      id: generateTempId(),
      created_at: new Date().toISOString(),
      file_name: fileName,
      row_data: emptyRowData,
      isNew: true,
    };

    setRecords((prev) => [...prev, newRecord]);
    setSuccessMessage("새 행이 추가되었습니다. 데이터를 입력하세요.");
    setTimeout(() => setSuccessMessage(""), 2000);
  };

  // 새 열 추가 모달 열기
  const handleOpenAddColumnModal = () => {
    setNewColumnName("");
    setShowAddColumnModal(true);
  };

  // 새 열 추가 실행
  const handleAddColumn = async () => {
    const trimmedName = newColumnName.trim();
    
    if (!trimmedName) {
      setError("컬럼 이름을 입력해주세요.");
      return;
    }

    // 중복 체크
    if (headers.includes(trimmedName) || displayHeaders.includes(trimmedName)) {
      setError("이미 존재하는 컬럼 이름입니다.");
      return;
    }

    setIsAddingColumn(true);
    setError("");

    try {
      // DB의 모든 레코드에 새 컬럼 추가 (JSONB 업데이트)
      const savedRecords = records.filter((r) => !r.isNew && r.id > 0);
      
      // 각 레코드의 row_data에 새 키 추가
      const updatePromises = savedRecords.map(async (record) => {
        const updatedRowData = {
          ...record.row_data,
          [trimmedName]: "",
        };

        return supabase
          .from("재고")
          .update({ row_data: updatedRowData })
          .eq("id", record.id);
      });

      const results = await Promise.all(updatePromises);
      
      // 에러 체크
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        setError(`일부 레코드 업데이트 실패: ${errors[0].error?.message}`);
        return;
      }

      // 로컬 상태 업데이트
      setRecords((prev) =>
        prev.map((r) => ({
          ...r,
          row_data: {
            ...r.row_data,
            [trimmedName]: "",
          },
        }))
      );

      // 헤더 업데이트
      setHeaders((prev) => [...prev, trimmedName]);
      setDisplayHeaders((prev) => [...prev, trimmedName]);

      setSuccessMessage(`새 열 '${trimmedName}'이(가) 추가되었습니다.`);
      setTimeout(() => setSuccessMessage(""), 2000);
      setShowAddColumnModal(false);
      setNewColumnName("");
    } catch (err) {
      console.error("Add column error:", err);
      setError("열 추가 중 오류가 발생했습니다.");
    } finally {
      setIsAddingColumn(false);
    }
  };

  // 모달 키보드 이벤트
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddColumn();
    } else if (e.key === "Escape") {
      setShowAddColumnModal(false);
    }
  };

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

    const updatedRowData = {
      ...record.row_data,
      [colKey]: editValue,
    };

    try {
      if (record.isNew || record.id < 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from("재고")
          .insert({
            file_name: fileName,
            row_data: updatedRowData,
          })
          .select()
          .single();

        if (insertError) {
          setError(`저장 실패: ${insertError.message}`);
        } else if (insertedData) {
          setRecords((prev) =>
            prev.map((r) =>
              r.id === rowId
                ? { ...insertedData, isNew: false }
                : r
            )
          );
          setSuccessMessage("새로운 데이터가 추가되었습니다.");
          setTimeout(() => setSuccessMessage(""), 2000);
        }
      } else {
        const { error: updateError } = await supabase
          .from("재고")
          .update({ row_data: updatedRowData })
          .eq("id", rowId);

        if (updateError) {
          setError(`저장 실패: ${updateError.message}`);
        } else {
          setRecords((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, row_data: updatedRowData } : r))
          );
          setSuccessMessage("저장됨");
          setTimeout(() => setSuccessMessage(""), 1500);
        }
      }
    } catch (err) {
      console.error("Update error:", err);
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setEditingCell(null);
    }
  };

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

  const handleBlur = () => {
    handleCellUpdate();
  };

  const handleCancelNewRow = (rowId: number) => {
    setRecords((prev) => prev.filter((r) => r.id !== rowId));
  };

  return (
    <main className={styles.main} dir="ltr">
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
          <span className={styles.recordCount}>{records.length}개 행 · {headers.length}개 열</span>
          <button onClick={handleAddRow} className={styles.addRowBtn}>
            ➕ 행 추가
          </button>
          <button onClick={handleOpenAddColumnModal} className={styles.addColBtn}>
            ➕ 열 추가
          </button>
          <button onClick={fetchData} className={styles.refreshBtn}>
            🔄 새로고침
          </button>
        </div>
      </header>

      {/* 열 추가 모달 */}
      {showAddColumnModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddColumnModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>➕ 새 열 추가</h2>
              <button 
                className={styles.modalCloseBtn}
                onClick={() => setShowAddColumnModal(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <label htmlFor="columnName" className={styles.modalLabel}>
                새 컬럼 이름
              </label>
              <input
                ref={columnInputRef}
                id="columnName"
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={handleModalKeyDown}
                className={styles.modalInput}
                placeholder="예: 비고, 담당자, 위치..."
                disabled={isAddingColumn}
              />
              <p className={styles.modalHint}>
                💡 모든 행에 빈 컬럼이 추가됩니다. 추가 후 각 셀을 클릭하여 데이터를 입력하세요.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelBtn}
                onClick={() => setShowAddColumnModal(false)}
                disabled={isAddingColumn}
              >
                취소
              </button>
              <button 
                className={styles.modalConfirmBtn}
                onClick={handleAddColumn}
                disabled={isAddingColumn || !newColumnName.trim()}
              >
                {isAddingColumn ? (
                  <>
                    <span className={styles.btnSpinner}></span>
                    추가 중...
                  </>
                ) : (
                  "열 추가"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel-like Grid */}
      <div className={styles.gridContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : records.length > 0 && headers.length > 0 ? (
          <div className={styles.gridWrapper} dir="ltr">
            <table className={styles.excelGrid} dir="ltr">
              <thead>
                <tr>
                  <th className={styles.rowHeader}></th>
                  {headers.map((header, idx) => (
                    <th key={header} className={styles.colHeader}>
                      <span className={styles.colLetter}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className={styles.colName}>{displayHeaders[idx]}</span>
                    </th>
                  ))}
                  <th className={styles.actionHeader}>작업</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, rowIdx) => (
                  <tr key={record.id} className={record.isNew ? styles.newRow : ""}>
                    <td className={styles.rowHeader}>
                      {rowIdx + 1}
                      {record.isNew && <span className={styles.newBadge}>NEW</span>}
                    </td>
                    {headers.map((header) => {
                      const isEditing =
                        editingCell?.rowId === record.id && editingCell?.colKey === header;
                      const cellValue = record.row_data[header];

                      return (
                        <td
                          key={`${record.id}-${header}`}
                          className={`${styles.cell} ${isEditing ? styles.editing : ""} ${record.isNew ? styles.newCell : ""}`}
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
                              placeholder="입력하세요..."
                            />
                          ) : (
                            <span className={styles.cellContent}>
                              {cellValue !== null && cellValue !== undefined && String(cellValue) !== ""
                                ? String(cellValue)
                                : record.isNew ? <span className={styles.placeholder}>클릭하여 입력</span> : ""}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={styles.actionCell}>
                      {record.isNew && (
                        <button
                          onClick={() => handleCancelNewRow(record.id)}
                          className={styles.cancelBtn}
                          title="행 삭제"
                        >
                          ✕
                        </button>
                      )}
                    </td>
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
            <button onClick={handleAddRow} className={styles.addFirstRowBtn}>
              ➕ 첫 번째 행 추가하기
            </button>
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
        {editingCell && <span>편집 중: {cleanHeaderName(editingCell.colKey)}</span>}
        {records.some((r) => r.isNew) && <span className={styles.unsavedIndicator}>⚠ 저장되지 않은 행이 있습니다</span>}
      </footer>
    </main>
  );
}
