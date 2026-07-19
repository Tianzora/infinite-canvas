export { exportCanvasProjects } from "@/app/(user)/canvas/utils/canvas-export";

import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = "画布元素") {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const usedNames = new Set<string>();
    const uniqueName = (base: string, extension: string) => {
        const safeBase = safeFileName(base) || "元素";
        let name = `${safeBase}.${extension}`;
        for (let index = 1; usedNames.has(name); index += 1) name = `${safeBase}-${index}.${extension}`;
        usedNames.add(name);
        return name;
    };

    for (const node of nodes) {
        const title = node.title || node.type;
        const storageKey = node.metadata?.storageKey || "";
        if (storageKey) {
            const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (blob) {
                zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
                continue;
            }
        }
        if (node.type === CanvasNodeType.Text) {
            zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" });
            continue;
        }
        const content = node.metadata?.content;
        if (content?.startsWith("data:")) {
            const blob = await (await fetch(content)).blob();
            zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            continue;
        }
        zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
    }

    const zip = await createZip(zipFiles);
    saveAs(zip, `${safeFileName(fileName) || "画布元素"}.zip`);
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
