"use client";

import type { DragEvent, ReactNode } from "react";
import { CheckCircle2, ImagePlus, Plus, Trash2, UploadCloud, X } from "lucide-react";
import clsx from "clsx";

export type StyleListImage = {
  id: string;
  name: string;
  url: string;
  type: string;
};

export type StyleListRow = {
  id: string;
  sourceStyleId?: string;
  styleSequence: string;
  styleCode: string;
  styleName: string;
  isRequired: boolean;
  isFirstModelingStyle: boolean;
  productType: string;
  difficulty: string;
  estimatedWorkdays: string;
  originalArtStatus: string;
  originalArtApprovedDate: string;
  referenceImages: StyleListImage[];
  referenceImageUrlDraft: string;
  notes: string;
};

export type StyleListForm = {
  rows: StyleListRow[];
  note: string;
};

export type StyleListTaskRef = {
  id: string;
  taskNo: 7 | 10;
  taskName: string;
};

export type StyleListTaskRefs = {
  firstStyleTask?: StyleListTaskRef;
  remainingStylesTask?: StyleListTaskRef;
};

export function createDefaultStyleListForm(options?: {
  originalArtApprovedDate?: string;
  note?: string;
  styleCount?: number;
}): StyleListForm {
  const count = Math.max(1, options?.styleCount ?? 1);

  return {
    rows: Array.from({ length: count }, (_, index) =>
      createStyleListRow(index + 1, {
        isFirstModelingStyle: index === 0,
        originalArtApprovedDate: options?.originalArtApprovedDate ?? "",
      }),
    ),
    note: options?.note ?? "",
  };
}

export function StyleListModal({
  projectName,
  message,
  form,
  setForm,
  taskRefs,
  refsLoading,
  saving,
  uploadingRowId,
  onUploadImages,
  onCancel,
  onSubmit,
}: {
  projectName: string;
  message: string;
  form: StyleListForm;
  setForm: (form: StyleListForm) => void;
  taskRefs: StyleListTaskRefs | null;
  refsLoading: boolean;
  saving: boolean;
  uploadingRowId: string;
  onUploadImages: (rowId: string, files: File[]) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const firstRow = form.rows.find((row) => row.isFirstModelingStyle);

  function updateRow(rowId: string, patch: Partial<StyleListRow>) {
    setForm({
      ...form,
      rows: form.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  }

  function addRow() {
    const nextSequence = nextStyleSequence(form.rows);

    setForm({
      ...form,
      rows: [...form.rows, createStyleListRow(nextSequence, { isFirstModelingStyle: false })],
    });
  }

  function removeRow(rowId: string) {
    if (form.rows.length <= 1) {
      return;
    }

    const removedFirst = form.rows.some((row) => row.id === rowId && row.isFirstModelingStyle);
    const nextRows = form.rows.filter((row) => row.id !== rowId);

    setForm({
      ...form,
      rows: removedFirst ? nextRows.map((row, index) => ({ ...row, isFirstModelingStyle: index === 0 })) : nextRows,
    });
  }

  function setFirstRow(rowId: string) {
    setForm({
      ...form,
      rows: form.rows.map((row) => ({ ...row, isFirstModelingStyle: row.id === rowId })),
    });
  }

  function addImageUrl(rowId: string) {
    const row = form.rows.find((item) => item.id === rowId);
    const url = row?.referenceImageUrlDraft.trim();

    if (!row || !url) {
      return;
    }

    updateRow(rowId, {
      referenceImages: [
        ...row.referenceImages,
        {
          id: createClientId(),
          name: url.split("/").pop() || "参考图",
          url,
          type: "参考图",
        },
      ],
      referenceImageUrlDraft: "",
    });
  }

  function removeImage(rowId: string, imageId: string) {
    const row = form.rows.find((item) => item.id === rowId);

    if (!row) {
      return;
    }

    updateRow(rowId, {
      referenceImages: row.referenceImages.filter((image) => image.id !== imageId),
    });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>, rowId: string) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));

    if (files.length > 0) {
      onUploadImages(rowId, files);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 px-4 py-5 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-500">建模款式清单</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{projectName}</h2>
            <div className="mt-1 text-sm text-slate-500">
              {message || "原画里程碑完成后登记完整款式清单；提交后先等待建模侧确认，任务 7/10 启动时再进入未分配。"}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <section className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600 lg:grid-cols-[1fr_1fr_1fr]">
          <TaskRefPill
            label="第一款启动任务"
            value={refsLoading ? "读取中" : taskRefs?.firstStyleTask ? `${taskRefs.firstStyleTask.taskNo}. ${taskRefs.firstStyleTask.taskName}` : "缺少任务 7"}
            active={Boolean(taskRefs?.firstStyleTask)}
          />
          <TaskRefPill
            label="其余款启动任务"
            value={
              refsLoading
                ? "读取中"
                : taskRefs?.remainingStylesTask
                  ? `${taskRefs.remainingStylesTask.taskNo}. ${taskRefs.remainingStylesTask.taskName}`
                  : "缺少任务 10"
            }
            active={Boolean(taskRefs?.remainingStylesTask)}
          />
          <TaskRefPill
            label="第一款建模款式"
            value={firstRow?.styleName || firstRow?.styleCode || "待填写"}
            active={Boolean(firstRow)}
          />
        </section>

        <main className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-4">
            {form.rows.map((row, index) => (
              <StyleRowEditor
                key={row.id}
                row={row}
                index={index}
                canRemove={form.rows.length > 1}
                uploading={uploadingRowId === row.id}
                onUpdate={(patch) => updateRow(row.id, patch)}
                onSetFirst={() => setFirstRow(row.id)}
                onRemove={() => removeRow(row.id)}
                onDrop={(event) => handleDrop(event, row.id)}
                onUpload={(files) => onUploadImages(row.id, files)}
                onAddImageUrl={() => addImageUrl(row.id)}
                onRemoveImage={(imageId) => removeImage(row.id, imageId)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} />
            新增款式
          </button>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <label className="min-w-[280px] flex-1 text-xs font-medium text-slate-500">
            提交说明
            <input
              value={form.note}
              placeholder="可填写款式拆分口径、版权方特殊要求等"
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="h-10 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {saving ? "提交中" : "提交给建模排期"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StyleRowEditor({
  row,
  index,
  canRemove,
  uploading,
  onUpdate,
  onSetFirst,
  onRemove,
  onDrop,
  onUpload,
  onAddImageUrl,
  onRemoveImage,
}: {
  row: StyleListRow;
  index: number;
  canRemove: boolean;
  uploading: boolean;
  onUpdate: (patch: Partial<StyleListRow>) => void;
  onSetFirst: () => void;
  onRemove: () => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onUpload: (files: File[]) => void;
  onAddImageUrl: () => void;
  onRemoveImage: (imageId: string) => void;
}) {
  const fileInputId = `style-image-${row.id}`;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-slate-100 px-2 text-sm font-semibold text-slate-700">
            {index + 1}
          </div>
          <button
            type="button"
            onClick={onSetFirst}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold",
              row.isFirstModelingStyle
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <CheckCircle2 size={14} />
            第一款
          </button>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
            <input
              type="checkbox"
              checked={row.isRequired}
              onChange={(event) => onUpdate({ isRequired: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-rose-600"
            />
            必做
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} />
          删除
        </button>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-[96px_120px_minmax(0,1fr)]">
          <Field label="序号">
            <input
              value={row.styleSequence}
              onChange={(event) => onUpdate({ styleSequence: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="款式编号">
            <input
              value={row.styleCode}
              onChange={(event) => onUpdate({ styleCode: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="款式名称">
            <input
              value={row.styleName}
              placeholder="例如：站姿款"
              onChange={(event) => onUpdate({ styleName: event.target.value })}
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="产品类型">
            <input
              value={row.productType}
              placeholder="手办 / 毛绒"
              onChange={(event) => onUpdate({ productType: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="难度">
            <select
              value={row.difficulty}
              onChange={(event) => onUpdate({ difficulty: event.target.value })}
              className={inputClassName}
            >
              <option value="常规款">常规款</option>
              <option value="简单款">简单款</option>
              <option value="复杂款">复杂款</option>
              <option value="困难款">困难款</option>
            </select>
          </Field>
          <Field label="预计天数">
            <input
              type="number"
              min={0}
              value={row.estimatedWorkdays}
              onChange={(event) => onUpdate({ estimatedWorkdays: event.target.value })}
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="原画状态">
            <select
              value={row.originalArtStatus}
              onChange={(event) => onUpdate({ originalArtStatus: event.target.value })}
              className={inputClassName}
            >
              <option value="未过审">未过审</option>
              <option value="已过审">已过审</option>
            </select>
          </Field>
          <Field label="原画过审日期">
            <input
              type="date"
              value={row.originalArtApprovedDate}
              onChange={(event) => onUpdate({ originalArtApprovedDate: event.target.value })}
              className={inputClassName}
            />
          </Field>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) {
                onUpload(files);
              }
              event.currentTarget.value = "";
            }}
          />
          <label
            htmlFor={fileInputId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-sm text-slate-500 hover:bg-slate-100"
          >
            <UploadCloud size={22} />
            <span className="mt-1 font-semibold text-slate-700">{uploading ? "上传中" : "拖拽图片或点击上传"}</span>
            <span className="mt-0.5 text-xs">原画图、参考图、三视图都可以放这里</span>
          </label>
          <div className="flex gap-2">
            <input
              value={row.referenceImageUrlDraft}
              placeholder="也可以粘贴图片链接"
              onChange={(event) => onUpdate({ referenceImageUrlDraft: event.target.value })}
              className={inputClassName}
            />
            <button
              type="button"
              onClick={onAddImageUrl}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              添加
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <Field label="备注">
            <textarea
              value={row.notes}
              placeholder="可填写该款式的拆分说明、版权方要求或建模注意点"
              onChange={(event) => onUpdate({ notes: event.target.value })}
              rows={3}
              className="min-h-24 resize-none rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </Field>
          {row.referenceImages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {row.referenceImages.map((image) => (
                <div key={image.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <ImagePlus size={13} />
                  <span className="max-w-[220px] truncate">{image.name || image.url}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveImage(image.id)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="移除图片"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400">
              暂无图片。提交前建议至少上传原画图或参考图。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TaskRefPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={clsx("rounded-md border px-3 py-2", active ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={clsx("mt-1 truncate text-sm font-semibold", active ? "text-emerald-800" : "text-amber-800")}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

function createStyleListRow(
  sequence: number,
  options?: {
    isFirstModelingStyle?: boolean;
    originalArtApprovedDate?: string;
  },
): StyleListRow {
  return {
    id: createClientId(),
    styleSequence: String(sequence),
    styleCode: `S${String(sequence).padStart(2, "0")}`,
    styleName: "",
    isRequired: true,
    isFirstModelingStyle: options?.isFirstModelingStyle ?? false,
    productType: "",
    difficulty: "常规款",
    estimatedWorkdays: "7",
    originalArtStatus: options?.originalArtApprovedDate ? "已过审" : "未过审",
    originalArtApprovedDate: options?.originalArtApprovedDate ?? "",
    referenceImages: [],
    referenceImageUrlDraft: "",
    notes: "",
  };
}

function nextStyleSequence(rows: StyleListRow[]) {
  const values = rows
    .map((row) => Number.parseInt(row.styleSequence, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? Math.max(...values) + 1 : rows.length + 1;
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const inputClassName =
  "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100";
