"use client";

import { useState, useEffect } from "react";
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
  const [error, setError] = useState<string>("");

  const fetchFiles = async () => {
    setIsLoading(true);
    setError("");
    try {
      // file_name과 created_at만 가져와서 효율적으로 처리
      const { data: records, error: fetchError } = await supabase
        .from("재고")
        .select("file_name, created_at")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        setError(`데이터 불러오기 실패: ${fetchError.message}`);
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
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
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

    try {
      const { error: deleteError } = await supabase
        .from("재고")
        .delete()
        .eq("file_name", fileName);

      if (deleteError) {
        setError(`삭제 실패: ${deleteError.message}`);
      } else {
        // 목록에서 제거
        setFiles((prev) => prev.filter((f) => f.file_name !== fileName));
      }
    } catch (err) {
      console.error("Delete error:", err);
      setError("삭제 중 오류가 발생했습니다.");
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
          <span className={styles.dataCount}>총 {files.length}개 파일</span>
          <button onClick={fetchFiles} className={styles.refreshButton}>
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

      {/* File List */}
      <div className={styles.tableContainer}>
        {isLoading ? (
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
