import { OutFile } from "telegram/define"
import fs, { createWriteStream } from "fs"
import path from "path"
import { Api } from "telegram"
import { BinaryWriter } from "telegram/extensions/index.js"

export async function getProperFilename(
  file: OutFile | undefined,
  fileType: string,
  extension: string,
  date: number
) {
  if (!file || typeof file != 'string') {
    return file
  }

  if (fs.existsSync(file) && fs.lstatSync(file).isDirectory()) {
    let fullName = fileType + date + extension
    return path.join(file, fullName)
  }
  
  return file
}


export function getThumb(
  thumbs: (Api.TypePhotoSize | Api.TypeVideoSize)[],
  thumb?: number | string | Api.TypePhotoSize | Api.VideoSize
) {
  function sortThumb(thumb: Api.TypePhotoSize | Api.TypeVideoSize) {
      if (thumb instanceof Api.PhotoStrippedSize) {
          return thumb.bytes.length;
      }
      if (thumb instanceof Api.PhotoCachedSize) {
          return thumb.bytes.length;
      }
      if (thumb instanceof Api.PhotoSize) {
          return thumb.size;
      }
      if (thumb instanceof Api.PhotoSizeProgressive) {
          return Math.max(...thumb.sizes);
      }
      if (thumb instanceof Api.VideoSize) {
          return thumb.size;
      }
      return 0;
  }

  thumbs = thumbs.sort((a, b) => sortThumb(a) - sortThumb(b));
  const correctThumbs = [];
  for (const t of thumbs) {
      if (!(t instanceof Api.PhotoPathSize)) {
          correctThumbs.push(t);
      }
  }
  if (thumb == undefined) {
      return correctThumbs.pop();
  } else if (typeof thumb == "number") {
      return correctThumbs[thumb];
  } else if (typeof thumb == "string") {
      for (const t of correctThumbs) {
          if ("type" in t && t.type == thumb) {
              return t;
          }
      }
  } else if (
      thumb instanceof Api.PhotoSize ||
      thumb instanceof Api.PhotoCachedSize ||
      thumb instanceof Api.PhotoStrippedSize ||
      thumb instanceof Api.VideoSize
  ) {
      return thumb;
  }
}

export function getWriter(outputFile?: OutFile) {
  if (!outputFile || Buffer.isBuffer(outputFile)) {
      return new BinaryWriter(Buffer.alloc(0));
  } else if (typeof outputFile == "string") {
      // We want to make sure that the path exists.
      return createWriteStream(outputFile);
  } else {
      return outputFile;
  }
}

export function closeWriter(
  writer: BinaryWriter | { write: Function; close?: Function }
) {
  if ("close" in writer && writer.close) {
      writer.close();
  }
}

export function returnWriterValue(writer: any): Buffer | string | undefined {
  if (writer instanceof BinaryWriter) {
      return writer.getValue();
  }
  if (writer instanceof fs.WriteStream) {
      if (typeof writer.path == "string") {
          return path.resolve(writer.path);
      } else {
          return Buffer.from(writer.path);
      }
  }
}