"use client";

import { useCallback, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { AlertCircle, ArrowLeft, ChevronRight, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Supported estimate tools for v0.1 ingestion
const SUPPORTED_ESTIMATE_TOOLS = ["jobber", "housecall-pro", "file"] as const;

type SupportedEstimateTool = (typeof SUPPORTED_ESTIMATE_TOOLS)[number];

const TOOL_LABELS: Record<string, string> = {
  jobber: "Jobber",
  "housecall-pro": "Housecall Pro",
  file: "File",
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  jobber: "One-time import of recent estimates. This creates a snapshot without maintaining a long-term connection.",
  "housecall-pro":
    "One-time import of recent estimates. This creates a snapshot without maintaining a long-term connection.",
  file: "One-time import of recent estimates. This creates a snapshot without maintaining a long-term connection.",
};

function isSupportedEstimateTool(tool: string | null): tool is SupportedEstimateTool {
  return tool !== null && SUPPORTED_ESTIMATE_TOOLS.includes(tool as SupportedEstimateTool);
}

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("category");
  const tool = searchParams.get("tool");

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    received: number;
    kept: number;
    rejected: number;
  } | null>(null);

  // Determine if this is a supported estimates flow
  const isEstimatesFlow = category === "estimates" && isSupportedEstimateTool(tool);
  const showComingSoon = !isEstimatesFlow;

  const toolLabel = tool ? TOOL_LABELS[tool] || "Unknown" : "Unknown";
  const toolDescription = tool ? TOOL_DESCRIPTIONS[tool] || "" : "";

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError(null);
      setResult(null);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  }, []);

  const handleUpload = async () => {
    if (!file || !tool) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      // Create source first
      const sourceResponse = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: tool === "file" ? "csv" : tool,
          source_name: `${toolLabel} Import - ${new Date().toLocaleDateString()}`,
        }),
      });

      if (!sourceResponse.ok) {
        const errorData = await sourceResponse.json();
        throw new Error(errorData.error || "Failed to create source");
      }

      const { source_id } = await sourceResponse.json();

      // Upload file
      const formData = new FormData();
      formData.append("source_id", source_id);
      formData.append("file", file);

      const ingestResponse = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      const data = await ingestResponse.json();

      if (!ingestResponse.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResult({
        received: data.received,
        kept: data.kept,
        rejected: data.rejected,
      });

      // Auto-redirect to review after showing results briefly
      setTimeout(() => {
        router.push(`/dashboard/review?source_id=${source_id}`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle "coming soon" state
  if (showComingSoon) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Connector coming soon</h1>
          <p className="text-muted-foreground">
            Estimates are enough to generate a snapshot. For now, you can use a one-time import.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="space-y-2 text-center">
              <p className="text-muted-foreground">This connector will be available in a future release.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/dashboard/connect")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Connect
              </Button>
              <Button onClick={() => router.push("/dashboard/import?category=estimates&tool=file")}>
                Use one-time import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render estimates import flow
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Import from {toolLabel}</h1>
        <p className="text-muted-foreground">{toolDescription}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload export file</CardTitle>
          <CardDescription>Recent estimates only</CardDescription>
          <p className="pt-2 text-muted-foreground text-sm">
            We normalize estimate status (sent/accepted/converted) and ignore customer or line-item details.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            aria-label="Upload file by clicking or dragging and dropping"
            className={`relative flex min-h-50 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("file-input")?.click();
              }
            }}
          >
            <input id="file-input" type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
            {file ? (
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-sm">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setResult(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-muted-foreground text-sm">Drop your export file here or click to browse</p>
              </>
            )}
          </button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert>
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Import complete</p>
                  <p className="text-sm">Rows received: {result.received}</p>
                  <p className="text-sm">Estimates included: {result.kept}</p>
                  <p className="text-muted-foreground text-sm">Rows not included: {result.rejected}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handleUpload} disabled={!file || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Import Estimates
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
