import { createGzip, createGunzip } from 'zlib';
import { promisify } from 'util';

const pipeline = promisify(require('stream').pipeline);

/**
 * 使用Gzip压缩数据
 */
export async function compressToGzip(data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const gzip = createGzip();
    const chunks: Buffer[] = [];

    gzip.on('data', (chunk) => chunks.push(chunk));
    gzip.on('end', () => {
      const compressed = Buffer.concat(chunks);
      resolve(compressed.toString('base64'));
    });
    gzip.on('error', reject);

    gzip.write(data);
    gzip.end();
  });
}

/**
 * 从Gzip解压数据
 */
export async function decompressFromGzip(compressedData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(compressedData, 'base64');
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];

    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', () => {
      const decompressed = Buffer.concat(chunks);
      resolve(decompressed.toString('utf8'));
    });
    gunzip.on('error', reject);

    gunzip.write(buffer);
    gunzip.end();
  });
}

/**
 * 压缩文件
 */
export async function compressFile(inputPath: string, outputPath: string): Promise<void> {
  const gzip = createGzip();
  const readStream = require('fs').createReadStream(inputPath);
  const writeStream = require('fs').createWriteStream(outputPath);

  await pipeline(readStream, gzip, writeStream);
}

/**
 * 解压文件
 */
export async function decompressFile(inputPath: string, outputPath: string): Promise<void> {
  const gunzip = createGunzip();
  const readStream = require('fs').createReadStream(inputPath);
  const writeStream = require('fs').createWriteStream(outputPath);

  await pipeline(readStream, gunzip, writeStream);
}