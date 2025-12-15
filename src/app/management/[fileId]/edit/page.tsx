"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

// 새 행을 위한 임시 ID 생성 (음수값 사용)
let tempIdCounter = -1;
const generateTempId = () => {
  return tempIdCounter--;
};

// 빈 행 여러 개 생성 함수
const createEmptyRows = (headers: string[], fileName: string, count: number): DbRecord[] => {
  const newRows: DbRecord[] = [];
  for (let i = 0; i < count; i++) {
    const emptyRowData: Record<string, string | number | boolean | null> = {};
    headers.forEach((header) => {
      emptyRowData[header] = "";
    });

    newRows.push({
      id: generateTempId(),
      created_at: new Date().toISOString(),
      file_name: fileName,
      row_data: emptyRowData,
      isNew: true,
    });
  }
  return newRows;
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

  // 무한 스크롤 관련
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

        // 모든 레코드에서 헤더 수집
        const allHeadersSet = new Set<string>();
        uniqueRecords.forEach((record) => {
          if (record.row_data) {
            Object.keys(record.row_data).forEach((key) => allHeadersSet.add(key));
          }
        });

        const allHeaders = Array.from(allHeadersSet);
        
        // 유효한 컬럼만 필터링
        const validHeaders = allHeaders.filter((h) => {
          const cleanName = cleanHeaderName(h);
          
          if (/^column\s*\d+$/i.test(cleanName)) {
            return false;
          }
          
          if (!cleanName || cleanName.trim() === "") {
            return false;
          }
          
          const hasData = uniqueRecords.some((record) => {
            const value = record.row_data[h];
            return value !== null && value !== undefined && String(value).trim() !== "";
          });
          
          return hasData;
        });
        
        setHeaders(validHeaders);
        setDisplayHeaders(validHeaders.map(cleanHeaderName));
        
        // 페이지 로딩 시 빈 행 30개 자동 추가 (Excel처럼 스크롤 가능하도록)
        const initialEmptyRows = createEmptyRows(validHeaders, decodedFileName, 30);
        setRecords([...uniqueRecords, ...initialEmptyRows]);
      } else {
        // 데이터가 없어도 헤더가 있으면 빈 행 추가
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

  // 무한 스크롤: 스크롤 바닥 도달 시 빈 행 15개 자동 추가 (Excel처럼)
  const loadMoreRows = useCallback(() => {
    if (isLoadingMore || headers.length === 0) return;
    
    setIsLoadingMore(true);
    
    // 빈 행 15개 추가 (Excel처럼 여유있게)
    const newRows = createEmptyRows(headers, fileName, 15);
    setRecords((prev) => [...prev, ...newRows]);
    
    // 짧은 딜레이 후 로딩 상태 해제
    requestAnimationFrame(() => {
      setIsLoadingMore(false);
    });
  }, [headers, fileName, isLoadingMore]);

  // 스크롤 이벤트로 테이블 바닥 감지 (무한 스크롤 - Excel 스타일)
  useEffect(() => {
    const gridWrapper = gridWrapperRef.current;
    if (!gridWrapper || isLoading || headers.length === 0) return;

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = gridWrapper;
          
          // 바닥에서 300px 이내에 도달하면 행 추가 (더 일찍 트리거)
          const isNearBottom = scrollTop + clientHeight >= scrollHeight - 300;
          
          if (isNearBottom && !isLoadingMore) {
            loadMoreRows();
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    gridWrapper.addEventListener("scroll", handleScroll, { passive: true });

    // 초기 로드 시 스크롤 가능 여부 체크
    const checkInitialScroll = () => {
      const { scrollHeight, clientHeight } = gridWrapper;
      // 컨텐츠가 화면보다 작으면 자동으로 행 추가
      if (scrollHeight <= clientHeight && !isLoadingMore) {
        loadMoreRows();
      }
    };
    
    // 약간의 딜레이 후 초기 체크
    const timer = setTimeout(checkInitialScroll, 100);

    return () => {
      gridWrapper.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, [loadMoreRows, isLoading, isLoadingMore, headers.length]);

  // 새 열 추가 모달 열기
  const handleOpenAddColumnModal = () => {
    setNewColumnName("");
    setShowAddColumnModal(true);
  };

  // 새 열 추가 실행 (JSONB 기반 UPDATE)
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

  // 셀 수정 후 DB 업데이트 (새 행이면 Insert, 기존 행이면 Update)
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
      // 새 행이면 INSERT (무한 스크롤로 생성된 빈 행에 데이터 입력 시)
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
          setSuccessMessage("✓ DB에 저장됨");
          setTimeout(() => setSuccessMessage(""), 1500);
        }
      } else {
        // 기존 행이면 UPDATE
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

  // 저장되지 않은 빈 행 모두 삭제
  const handleClearEmptyRows = () => {
    setRecords((prev) => prev.filter((r) => {
      if (!r.isNew) return true;
      // 데이터가 하나라도 있으면 유지
      return Object.values(r.row_data).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    }));
    setSuccessMessage("빈 행이 정리되었습니다.");
    setTimeout(() => setSuccessMessage(""), 2000);
  };

  // 미저장 행 전체 저장 (빈 행 포함)
  const [isSavingAll, setIsSavingAll] = useState(false);
  
  const handleSaveAllRows = async () => {
    const unsavedRows = records.filter((r) => r.isNew || r.id < 0);
    
    if (unsavedRows.length === 0) {
      setSuccessMessage("저장할 새 행이 없습니다.");
      setTimeout(() => setSuccessMessage(""), 2000);
      return;
    }

    setIsSavingAll(true);
    setError("");

    try {
      // 모든 미저장 행을 한 번에 INSERT
      const rowsToInsert = unsavedRows.map((row) => ({
        file_name: fileName,
        row_data: row.row_data,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from("재고")
        .insert(rowsToInsert)
        .select();

      if (insertError) {
        setError(`전체 저장 실패: ${insertError.message}`);
      } else if (insertedData) {
        // 저장된 데이터로 상태 업데이트
        const insertedMap = new Map(
          insertedData.map((item, idx) => [unsavedRows[idx].id, item])
        );

        setRecords((prev) =>
          prev.map((r) => {
            if (insertedMap.has(r.id)) {
              const savedRow = insertedMap.get(r.id);
              return { ...savedRow, isNew: false } as DbRecord;
            }
            return r;
          })
        );

        setSuccessMessage(`✓ ${insertedData.length}개 행이 DB에 저장되었습니다!`);
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      console.error("Save all error:", err);
      setError("전체 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingAll(false);
    }
  };

  // 저장되지 않은 행 개수
  const unsavedCount = records.filter((r) => r.isNew).length;
  const savedCount = records.filter((r) => !r.isNew).length;

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
          <span className={styles.recordCount}>
            저장됨: {savedCount} · 미저장: {unsavedCount} · 열: {headers.length}
          </span>
          <button onClick={handleOpenAddColumnModal} className={styles.addColBtn}>
            ➕ 열 추가
          </button>
          {unsavedCount > 0 && (
            <>
              <button 
                onClick={handleSaveAllRows} 
                className={styles.saveAllBtn}
                disabled={isSavingAll}
              >
                {isSavingAll ? "⏳ 저장 중..." : `💾 전체 저장 (${unsavedCount}행)`}
              </button>
              <button onClick={handleClearEmptyRows} className={styles.clearBtn}>
                🧹 빈 행 정리
              </button>
            </>
          )}
          <button onClick={fetchData} className={styles.refreshBtn}>
            🔄 새로고침
          </button>
        </div>
      </header>

      {/* 열 추가 모달 (JSONB 기반 UPDATE) */}
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
                💡 모든 행의 JSONB row_data에 새 컬럼이 추가됩니다.
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

      {/* Excel-like Grid with Infinite Scroll */}
      <div className={styles.gridContainer}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : records.length > 0 && headers.length > 0 ? (
          <div className={styles.gridWrapper} dir="ltr" ref={gridWrapperRef}>
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
                              placeholder="입력 후 Enter로 저장..."
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
            
            {/* 무한 스크롤 로딩 표시 */}
            <div className={styles.loadMoreTrigger}>
              {isLoadingMore ? (
                <div className={styles.loadingMore}>
                  <div className={styles.miniSpinner}></div>
                  <span>행 추가 중...</span>
                </div>
              ) : (
                <div className={styles.scrollPrompt}>
                  ↓ 아래로 스크롤하면 빈 행이 자동 추가됩니다
                </div>
              )}
            </div>
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
        <span>총 행: {records.length}</span>
        <span>열: {headers.length}</span>
        {editingCell && <span>편집 중: {cleanHeaderName(editingCell.colKey)}</span>}
        {unsavedCount > 0 && (
          <span className={styles.unsavedIndicator}>
            ⚠ 미저장 행: {unsavedCount}개 (데이터 입력 후 Enter로 저장)
          </span>
        )}
      </footer>
    </main>
  );
}
