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

// 숫자만 입력 가능한 컬럼 목록 (대소문자 무시, 공백 제거하여 비교)
const NUMERIC_ONLY_COLUMNS = [
  "현재_재고",
  "현재재고", 
  "재고",
  "단가",
  "가격",
  "수량",
  "금액",
  "총액",
  "합계",
];

// 컬럼이 숫자만 입력 가능한지 확인
const isNumericColumn = (header: string): boolean => {
  const cleanedHeader = cleanHeaderName(header).toLowerCase().replace(/[\s_-]/g, "");
  return NUMERIC_ONLY_COLUMNS.some(
    (col) => cleanedHeader.includes(col.toLowerCase().replace(/[\s_-]/g, ""))
  );
};

// 값이 유효한 숫자인지 확인 (빈 값도 허용)
const isValidNumber = (value: string): boolean => {
  if (value === "" || value === null || value === undefined) return true;
  const trimmed = String(value).trim();
  if (trimmed === "") return true;
  // 숫자, 소수점, 음수 부호 허용
  return /^-?\d*\.?\d*$/.test(trimmed);
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

  // 일괄 저장을 위한 수정된 행 추적
  const [modifiedRowIds, setModifiedRowIds] = useState<Set<number>>(new Set());
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // 유효성 검사 오류 셀 추적 (rowId-colKey 형식)
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string>("");

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

  // 셀 수정 - 로컬 상태만 업데이트하고 수정된 행 추적 (일괄 저장 방식)
  const handleCellUpdate = () => {
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
      // 값이 변경되지 않았으면 유효성 오류도 제거
      const cellKey = `${rowId}-${colKey}`;
      setInvalidCells((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cellKey);
        return newSet;
      });
      return;
    }

    const cellKey = `${rowId}-${colKey}`;

    // 숫자 컬럼 유효성 검사
    if (isNumericColumn(colKey) && !isValidNumber(editValue)) {
      // 유효하지 않은 셀로 표시
      setInvalidCells((prev) => new Set(prev).add(cellKey));
      setValidationError(`⚠️ "${cleanHeaderName(colKey)}" 컬럼에는 숫자만 입력할 수 있습니다.`);
      setTimeout(() => setValidationError(""), 4000);
      // 편집 모드 유지하여 수정 기회 제공
      return;
    }

    // 유효성 통과 시 오류 상태 제거
    setInvalidCells((prev) => {
      const newSet = new Set(prev);
      newSet.delete(cellKey);
      return newSet;
    });
    setValidationError("");

    const updatedRowData = {
      ...record.row_data,
      [colKey]: editValue,
    };

    // 로컬 상태만 업데이트
    setRecords((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, row_data: updatedRowData } : r))
    );

    // 수정된 행 ID 추적
    setModifiedRowIds((prev) => new Set(prev).add(rowId));
    
    setEditingCell(null);
  };

  // 일괄 저장 - 수정된 모든 행을 한 번에 Upsert
  const handleBatchSave = async () => {
    if (modifiedRowIds.size === 0) {
      setSuccessMessage("저장할 변경사항이 없습니다.");
      setTimeout(() => setSuccessMessage(""), 2000);
      return;
    }

    setIsBatchSaving(true);
    setError("");

    try {
      const modifiedRecords = records.filter((r) => modifiedRowIds.has(r.id));
      
      // 새 행 (INSERT 대상)
      const newRows = modifiedRecords.filter((r) => r.isNew || r.id < 0);
      // 기존 행 (UPDATE 대상)
      const existingRows = modifiedRecords.filter((r) => !r.isNew && r.id > 0);

      let insertedCount = 0;
      let updatedCount = 0;
      const newIdMapping = new Map<number, number>(); // 임시 ID -> 실제 ID

      // 새 행들 일괄 INSERT
      if (newRows.length > 0) {
        const rowsToInsert = newRows.map((row) => ({
          file_name: fileName,
          row_data: row.row_data,
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from("재고")
          .insert(rowsToInsert)
          .select();

        if (insertError) {
          throw new Error(`INSERT 실패: ${insertError.message}`);
        }

        if (insertedData) {
          insertedCount = insertedData.length;
          // 임시 ID와 실제 ID 매핑
          newRows.forEach((row, idx) => {
            if (insertedData[idx]) {
              newIdMapping.set(row.id, insertedData[idx].id);
            }
          });
        }
      }

      // 기존 행들 일괄 UPDATE (개별 UPDATE - Supabase는 bulk update 미지원)
      if (existingRows.length > 0) {
        const updatePromises = existingRows.map((row) =>
          supabase
            .from("재고")
            .update({ row_data: row.row_data })
            .eq("id", row.id)
        );

        const results = await Promise.all(updatePromises);
        const errors = results.filter((r) => r.error);
        
        if (errors.length > 0) {
          throw new Error(`UPDATE 실패: ${errors.length}개 행 오류`);
        }
        
        updatedCount = existingRows.length;
      }

      // 상태 업데이트: 새 행들의 ID 교체 및 isNew 플래그 제거
      setRecords((prev) =>
        prev.map((r) => {
          if (newIdMapping.has(r.id)) {
            return { ...r, id: newIdMapping.get(r.id)!, isNew: false };
          }
          if (modifiedRowIds.has(r.id) && r.isNew) {
            return { ...r, isNew: false };
          }
          return r;
        })
      );

      // 수정된 행 목록 초기화
      setModifiedRowIds(new Set());

      setSuccessMessage(`✓ ${insertedCount + updatedCount}개 행 저장 완료! (INSERT: ${insertedCount}, UPDATE: ${updatedCount})`);
      setTimeout(() => setSuccessMessage(""), 3000);

    } catch (err) {
      console.error("Batch save error:", err);
      setError(err instanceof Error ? err.message : "일괄 저장 중 오류가 발생했습니다.");
    } finally {
      setIsBatchSaving(false);
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

  // 행 개수 통계
  const newRowCount = records.filter((r) => r.isNew || r.id < 0).length;
  const savedRowCount = records.filter((r) => !r.isNew && r.id > 0).length;
  const modifiedCount = modifiedRowIds.size;

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
          {validationError && <span className={styles.validationError}>{validationError}</span>}
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.recordCount}>
            DB: {savedRowCount} · 새 행: {newRowCount} · 수정: {modifiedCount} · 열: {headers.length}
          </span>
          <button onClick={handleOpenAddColumnModal} className={styles.addColBtn}>
            ➕ 열 추가
          </button>
          {/* 일괄 저장 버튼 - 수정된 행이 있을 때 표시 */}
          {modifiedCount > 0 && (
            <button 
              onClick={handleBatchSave} 
              className={styles.batchSaveBtn}
              disabled={isBatchSaving}
            >
              {isBatchSaving ? "⏳ 저장 중..." : `💾 일괄 저장 (${modifiedCount}행)`}
            </button>
          )}
          {newRowCount > 0 && (
            <button onClick={handleClearEmptyRows} className={styles.clearBtn}>
              🧹 빈 행 정리
            </button>
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
                    <th 
                      key={header} 
                      className={`${styles.colHeader} ${isNumericColumn(header) ? styles.numericColHeader : ""}`}
                      title={isNumericColumn(header) ? "숫자만 입력 가능한 컬럼" : ""}
                    >
                      <span className={styles.colLetter}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className={styles.colName}>
                        {displayHeaders[idx]}
                        {isNumericColumn(header) && <span className={styles.numericBadge}>123</span>}
                      </span>
                    </th>
                  ))}
                  <th className={styles.actionHeader}>작업</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, rowIdx) => {
                  const isModified = modifiedRowIds.has(record.id);
                  const rowClassName = [
                    record.isNew ? styles.newRow : "",
                    isModified ? styles.modifiedRow : "",
                  ].filter(Boolean).join(" ");
                  
                  return (
                  <tr key={record.id} className={rowClassName}>
                    <td className={styles.rowHeader}>
                      {rowIdx + 1}
                      {record.isNew && <span className={styles.newBadge}>NEW</span>}
                      {isModified && !record.isNew && <span className={styles.modifiedBadge}>수정됨</span>}
                    </td>
                    {headers.map((header) => {
                      const isEditing =
                        editingCell?.rowId === record.id && editingCell?.colKey === header;
                      const cellValue = record.row_data[header];
                      const cellKey = `${record.id}-${header}`;
                      const isInvalid = invalidCells.has(cellKey);
                      const isNumeric = isNumericColumn(header);

                      return (
                        <td
                          key={cellKey}
                          className={`${styles.cell} ${isEditing ? styles.editing : ""} ${record.isNew ? styles.newCell : ""} ${isInvalid ? styles.invalidCell : ""}`}
                          onClick={() => !isEditing && handleCellClick(record.id, header, cellValue)}
                          title={isNumeric ? "숫자만 입력 가능" : ""}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleBlur}
                              className={`${styles.cellInput} ${isInvalid ? styles.invalidInput : ""}`}
                              placeholder={isNumeric ? "숫자만 입력..." : "입력 후 Enter로 저장..."}
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
                  );
                })}
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
        <span>📄 {fileName}</span>
        <span>행: {records.length}</span>
        <span>열: {headers.length}</span>
        {editingCell && <span>✏️ 편집 중: {cleanHeaderName(editingCell.colKey)}</span>}
        {modifiedCount > 0 && (
          <span className={styles.unsavedIndicator}>
            ⚠ 수정된 행: {modifiedCount}개 - 💾 일괄 저장 버튼을 눌러 저장하세요
          </span>
        )}
      </footer>
    </main>
  );
}
