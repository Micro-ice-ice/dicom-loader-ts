declare module '@cornerstonejs/dicom-codec' {
    interface ImageInfo {
        rows: number;
        columns: number;
        bitsAllocated: number;
        samplesPerPixel: number;
        signed: boolean;
    }

    type TypedArray =
        | Int8Array
        | Uint8Array
        | Uint8ClampedArray
        | Int16Array
        | Uint16Array
        | Int32Array
        | Uint32Array
        | Float32Array
        | Float64Array;

    function decode(
        compressedImageFrame: TypedArray,
        imageInfo: ImageInfo,
        sourceTransferSyntaxUID: string
    ): Promise<{ imageFrame: TypedArray; imageInfo: ImageInfo }>;
}
