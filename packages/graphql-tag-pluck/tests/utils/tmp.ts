import { file, FileCallback } from 'tmp'
import { ensureFileSync, createFileSync, unlinkSync } from 'fs-extra';

export const createTmpFile = (options: any) => new Promise<{ name: string, cleanupCallback: Function }>((resolve, reject) => {
  const callback: FileCallback = (err: Error, filename: string, cleanupCallback: any) => {
    if (err) {
      reject(err)
    }
    else {
      ensureFileSync(filename);
      createFileSync(filename);
      resolve({
        cleanupCallback: () => {
          unlinkSync(filename);
          cleanupCallback();
        },
        name: filename,
      })
    }
  }
  file(options, callback)
})
