"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

interface FileInfo {
  file_name: string;
  row_count: number;
  created_at: string;
  updated_at: string;
}

export default function ManagementPage() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // 토스트 알림 시스템
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'error' | 'success' }>>([]);
  const toastIdRef = useRef(0);

  // 토스트 추가 함수
  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    
    // 5초 후 자동 제거
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // 토스트 제거 함수
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      // file_name과 created_at만 가져와서 효율적으로 처리
      const { data: records, error: fetchError } = await supabase
        .from("재고")
        .select("file_name, created_at")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        showToast(`데이터 불러오기 실패: ${fetchError.message}`, 'error');
      } else if (records) {
        // 파일명 기준으로 DISTINCT 처리 (고유한 파일 목록 생성)
        const fileMap = new Map<string, FileInfo>();
        
        records.forEach((record) => {
          const fileName = record.file_name;
          
          // 이미 존재하는 파일이면 카운트 증가 및 날짜 업데이트
          if (fileMap.has(fileName)) {
            const existing = fileMap.get(fileName)!;
            existing.row_count += 1;
            
            const recordDate = new Date(record.created_at);
            if (recordDate > new Date(existing.updated_at)) {
              existing.updated_at = record.created_at;
            }
            if (recordDate < new Date(existing.created_at)) {
              existing.created_at = record.created_at;
            }
          } else {
            // 새로운 파일이면 추가 (DISTINCT 효과)
            fileMap.set(fileName, {
              file_name: fileName,
              row_count: 1,
              created_at: record.created_at,
              updated_at: record.created_at,
            });
          }
        });

        // Map을 배열로 변환 → 파일당 하나의 항목만 표시됨
        const uniqueFileList = Array.from(fileMap.values()).sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        setFiles(uniqueFileList);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      showToast("인터넷 연결을 확인해주세요. 데이터를 불러오는 중 오류가 발생했습니다.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // 파일 삭제 함수
  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`"${fileName}" 파일의 모든 데이터를 삭제하시겠습니까?`)) {
      return;
    }

    setIsDeleting(fileName);
    try {
      const { error: deleteError } = await supabase
        .from("재고")
        .delete()
        .eq("file_name", fileName);

      if (deleteError) {
        showToast(`삭제 실패: ${deleteError.message}`, 'error');
      } else {
        // 목록에서 제거
        setFiles((prev) => prev.filter((f) => f.file_name !== fileName));
        showToast(`"${fileName}" 파일이 삭제되었습니다.`, 'success');
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("인터넷 연결을 확인해주세요. 삭제 중 오류가 발생했습니다.", 'error');
    } finally {
      setIsDeleting(null);
    }
  };

  // 로딩 오버레이 표시 조건
  const showLoadingOverlay = (isLoading && files.length > 0) || isDeleting !== null;
  const loadingMessage = isDeleting ? `"${isDeleting}" 삭제 중...` : "데이터를 불러오는 중...";

  return (
    <main className={styles.main}>
      <div className={styles.glowOrb}></div>
      <div className={styles.glowOrb2}></div>

      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className={styles.toastContainer}>
          {toasts.map(toast => (
            <div 
              key={toast.id} 
              className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}
            >
              <span className={styles.toastIcon}>{toast.type === 'error' ? '⚠️' : '✓'}</span>
              <span className={styles.toastMessage}>{toast.message}</span>
              <button 
                onClick={() => removeToast(toast.id)} 
                className={styles.toastClose}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backButton}>
            ← 엑셀 업로드
          </Link>
          <h1 className={styles.title}>🗄️ DB 데이터 관리</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.dataCount}>총 {files.length}개 파일</span>
          <button onClick={fetchFiles} className={styles.refreshButton}>
            🔄 새로고침
          </button>
        </div>
      </header>

      {/* File List */}
      <div className={styles.tableContainer}>
        {/* 로딩/삭제 오버레이 */}
        {showLoadingOverlay && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingOverlayContent}>
              <div className={styles.overlaySpinner}></div>
              <p>{loadingMessage}</p>
            </div>
          </div>
        )}

        {isLoading && files.length === 0 ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : files.length > 0 ? (
          <div className={styles.fileList}>
            {files.map((file) => (
              <div key={file.file_name} className={styles.fileCard}>
                <div className={styles.fileCardIcon}>📊</div>
                <div className={styles.fileCardInfo}>
                  <h3 className={styles.fileCardName}>{file.file_name}</h3>
                  <div className={styles.fileCardMeta}>
                    <span>📝 {file.row_count}개 행</span>
                    <span>📅 {new Date(file.updated_at).toLocaleDateString("ko-KR")}</span>
                  </div>
                </div>
                <div className={styles.fileCardActions}>
                  <Link
                    href={`/management/${encodeURIComponent(file.file_name)}/edit`}
                    className={styles.editButton}
                  >
                    ✏️ 편집
                  </Link>
                  <button
                    onClick={() => handleDeleteFile(file.file_name)}
                    className={styles.deleteButton}
                  >
                    🗑️ 삭제
                  </button>
                </div>
              </div>
            ))}
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
