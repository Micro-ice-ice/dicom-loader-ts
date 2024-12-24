/** * Imports ***/
import { decode, TypedArray } from '@cornerstonejs/dicom-codec';
import {
    createJPEGBasicOffsetTable,
    parseDicom,
    readEncapsulatedImageFrame,
    readEncapsulatedPixelDataFromFragments,
} from 'dicom-parser';
import type { DataSet } from 'dicom-parser';

interface Segment {
    dataSet: DataSet;
}

interface SegmentationCode {
    segmentationCodeDesignator: string;
    segmentationCodeValue: string;
    segmentationCodeMeaning: string;
}

interface SegmentationSegment {
    recommendedDisplayCIELab: number[] | null;
    segmentationCodeDesignator: string;
    segmentationCodeValue: string;
    segmentationCodeMeaning: string;
    segmentNumber: number | null;
    segmentLabel: string | null;
    segmentAlgorithmType: string | null;
}

interface UltrasoundRegion {
    x0: number | null;
    y0: number | null;
    x1: number | null;
    y1: number | null;
    axisX: number | null;
    axisY: number | null;
    unitsX: string;
    unitsY: string;
    deltaX: number | null;
    deltaY: number | null;
}

/**
 * Dicom parser is a combination of utilities to get a VJS image from dicom files.
 */
export default class DicomParser {
    private _dataSet: DataSet;
    private _arrayBuffer: ArrayBuffer;

    constructor(data: { buffer: ArrayBuffer }) {
        this._arrayBuffer = data.buffer;

        try {
            const byteArray = new Uint8Array(this._arrayBuffer);
            this._dataSet = parseDicom(byteArray);
        } catch (err) {
            console.log(err);
            const error = new Error('parsers.dicom could not parse the file');
            throw error;
        }
    }

    /**
     * Series instance UID (0020,000e)
     *
     */
    get seriesInstanceUID() {
        return this._dataSet.string('x0020000e') ?? null;
    }

    /**
     * Study instance UID (0020,000d)
     */
    get studyInstanceUID() {
        return this._dataSet.string('x0020000d') ?? null;
    }

    /**
     * Get modality (0008,0060)
     */
    get modality() {
        return this._dataSet.string('x00080060') ?? null;
    }

    /**
     * Segmentation type (0062,0001)
     */
    get segmentationType() {
        return this._dataSet.string('x00620001') ?? null;
    }

    /**
     * Segmentation segments
     * -> Sequence of segments (0062,0002)
     *   -> Recommended Display CIELab
     *   -> Segmentation Code
     *   -> Segment Number (0062,0004)
     *   -> Segment Label (0062,0005)
     *   -> Algorithm Type (0062,0008)
     *
     */
    get segmentationSegments(): SegmentationSegment[] {
        const segmentationSegments: SegmentationSegment[] = [];
        const segmentSequence = this._dataSet.elements.x00620002;

        if (!segmentSequence || !segmentSequence.items) return segmentationSegments;

        for (const item of segmentSequence.items) {
            if (!item.dataSet) continue; // Ensure dataSet is defined before processing
            const recommendedDisplayCIELab = this._recommendedDisplayCIELab({
                dataSet: item.dataSet,
            });
            const segmentationCode = this._segmentationCode({ dataSet: item.dataSet });
            const segmentNumber = item.dataSet.uint16('x00620004');
            const segmentLabel = item.dataSet.string('x00620005');
            const segmentAlgorithmType = item.dataSet.string('x00620008');

            segmentationSegments.push({
                recommendedDisplayCIELab,
                segmentationCodeDesignator: segmentationCode.segmentationCodeDesignator,
                segmentationCodeValue: segmentationCode.segmentationCodeValue,
                segmentationCodeMeaning: segmentationCode.segmentationCodeMeaning,
                segmentNumber: segmentNumber || null,
                segmentLabel: segmentLabel || null,
                segmentAlgorithmType: segmentAlgorithmType || null,
            });
        }

        return segmentationSegments;
    }

    /**
     * Segmentation code
     * -> Code designator (0008,0102)
     * -> Code value (0008,0200)
     * -> Code Meaning Type (0008,0104)
     */
    private _segmentationCode(segment: Segment): SegmentationCode {
        const element = segment.dataSet.elements.x00082218;
        if (element && element.items && element.items.length > 0) {
            const dataSet = element.items[0].dataSet;

            if (dataSet) {
                return {
                    segmentationCodeDesignator: dataSet.string('x00080102') || 'unknown',
                    segmentationCodeValue: dataSet.string('x00080100') || 'unknown',
                    segmentationCodeMeaning: dataSet.string('x00080104') || 'unknown',
                };
            }
        }

        return {
            segmentationCodeDesignator: 'unknown',
            segmentationCodeValue: 'unknown',
            segmentationCodeMeaning: 'unknown',
        };
    }

    /**
     * Recommended display CIELab
     */
    _recommendedDisplayCIELab(segment: Segment) {
        if (!segment.dataSet.elements.x0062000d) {
            return null;
        }

        let offset = segment.dataSet.elements.x0062000d.dataOffset;
        let length = segment.dataSet.elements.x0062000d.length;
        let byteArray = segment.dataSet.byteArray.slice(offset, offset + length);

        // https://www.dabsoft.ch/dicom/3/C.10.7.1.1/
        let CIELabScaled = new Uint16Array(length / 2);
        for (let i = 0; i < length / 2; i++) {
            CIELabScaled[i] = (byteArray[2 * i + 1] << 8) + byteArray[2 * i];
        }

        let CIELabNormalized = [
            (CIELabScaled[0] / 65535) * 100,
            (CIELabScaled[1] / 65535) * 255 - 128,
            (CIELabScaled[2] / 65535) * 255 - 128,
        ];

        return CIELabNormalized;
    }

    /**
     * Raw dataset
     */
    get rawHeader() {
        return this._dataSet;
    }

    /**
     * SOP Instance UID
     */
    sopInstanceUID(frameIndex = 0) {
        return this._findStringEverywhere('x2005140f', 'x00080018', frameIndex);
    }

    /**
     * Transfer syntax UID
     */
    get transferSyntaxUID() {
        return this._dataSet.string('x00020010') ?? null;
    }

    /**
     * Study date
     */
    get studyDate() {
        return this._dataSet.string('x00080020') ?? null;
    }

    /**
     * Study description
     */
    get studyDescription() {
        return this._dataSet.string('x00081030') ?? null;
    }

    /**
     * Series date
     */
    get seriesDate() {
        return this._dataSet.string('x00080021') ?? null;
    }

    /**
     * Series description
     */
    get seriesDescription() {
        return this._dataSet.string('x0008103e') ?? null;
    }

    /**
     * Patient name
     */
    get patientName() {
        return this._dataSet.string('x00100010') ?? null;
    }

    /**
     * Patient ID
     */
    get patientID() {
        return this._dataSet.string('x00100020') ?? null;
    }

    /**
     * Patient birthdate
     */
    get patientBirthdate() {
        return this._dataSet.string('x00100030') ?? null;
    }

    /**
     * Patient sex
     */
    get patientSex() {
        return this._dataSet.string('x00100040') ?? null;
    }

    /**
     * Patient age
     */
    get patientAge() {
        return this._dataSet.string('x00101010') ?? null;
    }

    /**
     * Photometric interpretation
     */
    get photometricInterpretation() {
        return this._dataSet.string('x00280004') ?? null;
    }

    get planarConfiguration() {
        return this._dataSet.uint16('x00280006') ?? null;
    }

    get samplesPerPixel() {
        return this._dataSet.uint16('x00280002') ?? null;
    }

    get numberOfFrames() {
        return this._dataSet.intString('x00280008') ?? null;
    }

    get numberOfChannels() {
        let numberOfChannels = 1;
        let photometricInterpretation = this.photometricInterpretation;

        if (
            !(
                photometricInterpretation !== 'RGB' &&
                photometricInterpretation !== 'PALETTE COLOR' &&
                photometricInterpretation !== 'YBR_FULL' &&
                photometricInterpretation !== 'YBR_FULL_422' &&
                photometricInterpretation !== 'YBR_PARTIAL_422' &&
                photometricInterpretation !== 'YBR_PARTIAL_420' &&
                photometricInterpretation !== 'YBR_RCT'
            )
        ) {
            numberOfChannels = 3;
        }

        // make sure we return a number! (not a string!)
        return numberOfChannels;
    }

    invert() {
        let photometricInterpretation = this.photometricInterpretation;

        return photometricInterpretation === 'MONOCHROME1';
    }

    imageOrientation(frameIndex = 0) {
        // expect frame index to start at 0!
        const imageOrientation = this._findStringEverywhere('x00209116', 'x00200037', frameIndex);

        // format image orientation ('1\0\0\0\1\0') to array containing 6 numbers
        if (imageOrientation) {
            return imageOrientation.split('\\').map(parseFloat) as [
                number,
                number,
                number,
                number,
                number,
                number
            ];
        }

        return null;
    }

    referencedSegmentNumber(frameIndex = 0) {
        let referencedSegmentNumberElement = this._findInGroupSequence(
            'x52009230',
            'x0062000a',
            frameIndex
        );

        if (referencedSegmentNumberElement) {
            return referencedSegmentNumberElement.uint16('x0062000b');
        }

        return -1;
    }

    get pixelAspectRatio() {
        const pixelAspectRatio = [
            this._dataSet.intString('x00280034', 0),
            this._dataSet.intString('x00280034', 1),
        ];

        // need something smarter!
        if (typeof pixelAspectRatio[0] === 'undefined') {
            return undefined;
        }

        // make sure we return a number! (not a string!)
        return pixelAspectRatio as [number, number];
    }

    imagePosition(frameIndex = 0) {
        const imagePosition = this._findStringEverywhere('x00209113', 'x00200032', frameIndex);

        // format image position ('[-120.000000, 120.000000, 55.000000]') to array containing 3 numbers
        if (imagePosition) {
            // make sure we return a number! (not a string!)
            return imagePosition.split('\\').map(parseFloat) as [number, number, number];
        }

        return null;
    }

    instanceNumber(frameIndex: number = 0): number | null {
        let instanceNumber: number | null = null;

        // Check for the per-frame functional group sequence
        const perFrameFunctionnalGroupSequence = this._dataSet.elements.x52009230;

        if (
            perFrameFunctionnalGroupSequence?.items &&
            perFrameFunctionnalGroupSequence.items[frameIndex]?.dataSet
        ) {
            const frameElement =
                perFrameFunctionnalGroupSequence.items[frameIndex].dataSet.elements.x2005140f;

            if (frameElement?.items && frameElement.items[0]?.dataSet) {
                // Extract instance number from plane orientation sequence
                const planeOrientationSequence = frameElement.items[0].dataSet;
                instanceNumber = planeOrientationSequence.intString('x00200013') ?? null;
            } else {
                // Fall back to the default instance number in the dataset
                instanceNumber = this._dataSet.intString('x00200013') ?? null;
            }
        } else {
            // Default instance number if no functional group sequence is available
            instanceNumber = this._dataSet.intString('x00200013') ?? null;
        }

        return instanceNumber;
    }

    pixelSpacing(frameIndex = 0) {
        // expect frame index to start at 0!
        const value1 = this._findStringEverywhere('x00289110', 'x00280030', frameIndex);
        const value2 = this._dataSet.string('x00181164');

        const pixelSpacing = value1 ? value1 : value2 ? value2 : null;

        if (pixelSpacing) {
            const splittedSpacing = pixelSpacing.split('\\');
            if (splittedSpacing.length !== 2) {
                console.error(
                    `DICOM spacing format is not supported (could not split string on "\\"): ${pixelSpacing}`
                );
                return null;
            } else {
                return splittedSpacing.map(parseFloat) as [number, number];
            }
        }

        return null;
    }

    ultrasoundRegions(_frameIndex: number = 0): UltrasoundRegion[] {
        const sequence = this._dataSet.elements['x00186011'];

        if (!sequence?.items) {
            return [];
        }

        const ultrasoundRegions: UltrasoundRegion[] = [];

        sequence.items.forEach((item) => {
            if (!item.dataSet) {
                return;
            }

            ultrasoundRegions.push({
                x0: item.dataSet.uint32('x00186018') ?? null,
                y0: item.dataSet.uint32('x0018601a') ?? null,
                x1: item.dataSet.uint32('x0018601c') ?? null,
                y1: item.dataSet.uint32('x0018601e') ?? null,
                axisX: item.dataSet.int32('x00186020') ?? null,
                axisY: item.dataSet.int32('x00186022') ?? null,
                unitsX: this._getUnitsName(item.dataSet.uint16('x00186024') ?? 0),
                unitsY: this._getUnitsName(item.dataSet.uint16('x00186026') ?? 0),
                deltaX: item.dataSet.double('x0018602c') ?? null,
                deltaY: item.dataSet.double('x0018602e') ?? null,
            });
        });

        return ultrasoundRegions;
    }

    get frameTime() {
        const frameIncrementPointer = this._dataSet.uint16('x00280009', 1);
        let frameRate = this._dataSet.intString('x00082144');
        let frameTime;

        if (typeof frameIncrementPointer === 'number') {
            const frameIncrementPointerHexString = frameIncrementPointer.toString(16);
            const frameTime = this._dataSet.floatString('x0018' + frameIncrementPointerHexString);

            if (frameTime !== undefined) {
                return frameTime;
            }
        }

        if (frameTime === undefined && typeof frameRate === 'number') {
            return 1000 / frameRate;
        }

        return null;
    }

    get rows() {
        return this._dataSet.uint16('x00280010');
    }

    get columns() {
        return this._dataSet.uint16('x00280011');
    }

    get pixelType() {
        return 0;
    }

    get pixelRepresentation() {
        return this._dataSet.uint16('x00280103');
    }

    get pixelPaddingValue() {
        return this._dataSet.int16('x00280120');
    }

    get bitsAllocated() {
        // expect frame index to start at 0!
        return this._dataSet.uint16('x00280100');
    }

    get highBit() {
        // expect frame index to start at 0!
        return this._dataSet.uint16('x00280102');
    }

    rescaleIntercept(frameIndex = 0) {
        return this._findFloatStringInFrameGroupSequence('x00289145', 'x00281052', frameIndex);
    }

    rescaleSlope(frameIndex = 0) {
        return this._findFloatStringInFrameGroupSequence('x00289145', 'x00281053', frameIndex);
    }

    windowCenter(frameIndex = 0) {
        return this._findFloatStringInFrameGroupSequence('x00289132', 'x00281050', frameIndex);
    }

    windowWidth(frameIndex = 0) {
        return this._findFloatStringInFrameGroupSequence('x00289132', 'x00281051', frameIndex);
    }

    sliceThickness(frameIndex = 0) {
        return this._findFloatStringInFrameGroupSequence('x00289110', 'x00180050', frameIndex);
    }

    spacingBetweenSlices() {
        return this._dataSet.floatString('x00180088');
    }

    dimensionIndexValues(frameIndex: number = 0): number[] | null {
        let dimensionIndexValues: number[] | null = null;

        // Check for per-frame functional group sequence
        const perFrameFunctionalGroupSequence = this._dataSet.elements['x52009230'];

        if (
            perFrameFunctionalGroupSequence?.items &&
            perFrameFunctionalGroupSequence.items[frameIndex]?.dataSet
        ) {
            const frameContentSequence =
                perFrameFunctionalGroupSequence.items[frameIndex].dataSet.elements['x00209111'];

            if (frameContentSequence?.items && frameContentSequence.items[0]?.dataSet) {
                const dimensionIndexValuesElt =
                    frameContentSequence.items[0].dataSet.elements['x00209157'];

                if (dimensionIndexValuesElt) {
                    const nbValues = dimensionIndexValuesElt.length / 4; // 4 bytes for UL (unsigned long)
                    dimensionIndexValues = [];

                    for (let i = 0; i < nbValues; i++) {
                        dimensionIndexValues.push(
                            frameContentSequence.items[0].dataSet.uint32('x00209157', i) ?? 0
                        );
                    }
                }
            }
        }

        return dimensionIndexValues;
    }

    inStackPositionNumber(frameIndex: number = 0): number | null {
        let inStackPositionNumber: number | null = null;

        // Check for per-frame functional group sequence
        const perFrameFunctionalGroupSequence = this._dataSet.elements['x52009230'];

        if (
            perFrameFunctionalGroupSequence?.items &&
            perFrameFunctionalGroupSequence.items[frameIndex]?.dataSet
        ) {
            const philipsPrivateSequence =
                perFrameFunctionalGroupSequence.items[frameIndex].dataSet.elements['x00209111'];

            if (philipsPrivateSequence?.items && philipsPrivateSequence.items[0]?.dataSet) {
                inStackPositionNumber =
                    philipsPrivateSequence.items[0].dataSet.uint32('x00209057') ?? null;
            }
        }

        return inStackPositionNumber;
    }

    stackID(frameIndex: number = 0): string | null {
        let stackID: string | null = null;

        // Check for per-frame functional group sequence
        const perFrameFunctionalGroupSequence = this._dataSet.elements['x52009230'];

        if (
            perFrameFunctionalGroupSequence?.items &&
            perFrameFunctionalGroupSequence.items[frameIndex]?.dataSet
        ) {
            const philipsPrivateSequence =
                perFrameFunctionalGroupSequence.items[frameIndex].dataSet.elements['x00209111'];

            if (philipsPrivateSequence?.items && philipsPrivateSequence.items[0]?.dataSet) {
                stackID =
                    philipsPrivateSequence.items[0].dataSet.intString('x00209056')?.toString() ??
                    null;
            }
        }

        return stackID;
    }

    async extractPixelData(frameIndex = 0) {
        // decompress
        const decompressedData = await this._decodePixelData(frameIndex);

        const numberOfChannels = this.numberOfChannels;

        if (numberOfChannels > 1) {
            return this._convertColorSpace(decompressedData);
        } else {
            return decompressedData;
        }
    }

    //
    // private methods
    //

    private _findInGroupSequence(
        sequence: string,
        subsequence: string,
        index: number
    ): DataSet | null {
        const functionalGroupSequence = this._dataSet.elements[sequence];
        if (functionalGroupSequence?.items && functionalGroupSequence.items[index]?.dataSet) {
            const inSequence = functionalGroupSequence.items[index].dataSet.elements[subsequence];
            if (inSequence?.items && inSequence.items[0]?.dataSet) {
                return inSequence.items[0].dataSet;
            }
        }
        return null;
    }

    private _findStringInGroupSequence(
        sequence: string,
        subsequence: string,
        tag: string,
        index: number
    ): string | null {
        const dataSet = this._findInGroupSequence(sequence, subsequence, index);
        return dataSet?.string(tag) ?? null;
    }

    private _findStringInFrameGroupSequence(
        subsequence: string,
        tag: string,
        index: number
    ): string | null {
        return (
            this._findStringInGroupSequence('x52009229', subsequence, tag, 0) ||
            this._findStringInGroupSequence('x52009230', subsequence, tag, index)
        );
    }

    private _findStringEverywhere(subsequence: string, tag: string, index: number): string | null {
        let targetString = this._findStringInFrameGroupSequence(subsequence, tag, index);

        // Check PET module
        if (!targetString) {
            const petModule = 'x00540022';
            targetString = this._findStringInSequence(petModule, tag);
        }

        // Fallback to searching directly in _dataSet
        if (!targetString) {
            targetString = this._dataSet.string(tag) ?? null;
        }

        return targetString;
    }

    private _findStringInSequence(sequenceTag: string, tag: string): string | null {
        const sequence = this._dataSet.elements[sequenceTag];
        if (sequence?.items && sequence.items[0]?.dataSet) {
            return sequence.items[0].dataSet.string(tag) ?? null;
        }
        return null;
    }

    private _findFloatStringInGroupSequence(
        sequence: string,
        subsequence: string,
        tag: string,
        index: number
    ): number | null {
        let dataInGroupSequence = this._dataSet.floatString(tag);

        // Try to find in group sequence if undefined
        if (dataInGroupSequence === undefined) {
            const groupSequence = this._findInGroupSequence(sequence, subsequence, index);
            if (groupSequence) {
                return groupSequence.floatString(tag) ?? null;
            }
        }

        return dataInGroupSequence ?? null;
    }

    private _findFloatStringInFrameGroupSequence(
        subsequence: string,
        tag: string,
        index: number
    ): number | null {
        return (
            this._findFloatStringInGroupSequence('x52009229', subsequence, tag, 0) ||
            this._findFloatStringInGroupSequence('x52009230', subsequence, tag, index)
        );
    }

    async _decodePixelData(_frameIndex = 0) {
        // if compressed..?
        const transferSyntaxUID = this.transferSyntaxUID!;

        const pixelDataElement = this._dataSet.elements.x7fe00010;
        const pixelData = new Uint8Array(
            this._dataSet.byteArray.buffer,
            pixelDataElement.dataOffset,
            pixelDataElement.length
        );
        const bitsAllocated = this.bitsAllocated!;
        const columns = this.columns!;
        const rows = this.rows!;
        const samplesPerPixel = this.samplesPerPixel!;
        const signed = this.pixelRepresentation === 1 ? true : false;
        // find compression scheme

        const { imageFrame } = await decode(
            pixelData,
            { rows, columns, bitsAllocated, samplesPerPixel, signed },
            transferSyntaxUID
        );

        return imageFrame;
    }

    // github.com/chafey/cornerstoneWADOImageLoader/blob/master/src/imageLoader/wadouri/getEncapsulatedImageFrame.js
    framesAreFragmented() {
        const numberOfFrames = this._dataSet.intString('x00280008');
        const pixelDataElement = this._dataSet.elements.x7fe00010;

        return numberOfFrames !== pixelDataElement?.fragments?.length;
    }

    getEncapsulatedImageFrame(frameIndex: number) {
        if (
            this._dataSet.elements.x7fe00010 &&
            this._dataSet.elements.x7fe00010?.basicOffsetTable?.length
        ) {
            // Basic Offset Table is not empty
            return readEncapsulatedImageFrame(
                this._dataSet,
                this._dataSet.elements.x7fe00010,
                frameIndex
            );
        }

        if (this.framesAreFragmented()) {
            // Basic Offset Table is empty
            return readEncapsulatedImageFrame(
                this._dataSet,
                this._dataSet.elements.x7fe00010,
                frameIndex,
                createJPEGBasicOffsetTable(this._dataSet, this._dataSet.elements.x7fe00010)
            );
        }

        return readEncapsulatedPixelDataFromFragments(
            this._dataSet,
            this._dataSet.elements.x7fe00010,
            frameIndex
        );
    }

    _interpretAsRGB(photometricInterpretation: string) {
        const rgbLikeTypes = ['RGB', 'YBR_RCT', 'YBR_ICT', 'YBR_FULL_422'];

        return rgbLikeTypes.indexOf(photometricInterpretation) !== -1;
    }

    _convertColorSpace(uncompressedData: TypedArray) {
        let rgbData = null;
        const photometricInterpretation = this.photometricInterpretation;
        let planarConfiguration = this.planarConfiguration;
        if (planarConfiguration === null) {
            planarConfiguration = 0;
            window.console.log('Planar Configuration was not set and was defaulted to  0');
        }

        const interpretAsRGB = photometricInterpretation
            ? this._interpretAsRGB(photometricInterpretation)
            : false;

        if (interpretAsRGB && planarConfiguration === 0) {
            // ALL GOOD, ALREADY ORDERED
            // planar or non planar planarConfiguration
            rgbData = uncompressedData;
        } else if (interpretAsRGB && planarConfiguration === 1) {
            if (uncompressedData instanceof Int8Array) {
                rgbData = new Int8Array(uncompressedData.length);
            } else if (uncompressedData instanceof Uint8Array) {
                rgbData = new Uint8Array(uncompressedData.length);
            } else if (uncompressedData instanceof Int16Array) {
                rgbData = new Int16Array(uncompressedData.length);
            } else if (uncompressedData instanceof Uint16Array) {
                rgbData = new Uint16Array(uncompressedData.length);
            } else {
                const error = new Error(`Unsupported typed array: ${uncompressedData}`);
                throw error;
            }

            let numPixels = uncompressedData.length / 3;
            let rgbaIndex = 0;
            let rIndex = 0;
            let gIndex = numPixels;
            let bIndex = numPixels * 2;
            for (let i = 0; i < numPixels; i++) {
                rgbData[rgbaIndex++] = uncompressedData[rIndex++]; // red
                rgbData[rgbaIndex++] = uncompressedData[gIndex++]; // green
                rgbData[rgbaIndex++] = uncompressedData[bIndex++]; // blue
            }
        } else if (photometricInterpretation === 'YBR_FULL') {
            if (uncompressedData instanceof Int8Array) {
                rgbData = new Int8Array(uncompressedData.length);
            } else if (uncompressedData instanceof Uint8Array) {
                rgbData = new Uint8Array(uncompressedData.length);
            } else if (uncompressedData instanceof Int16Array) {
                rgbData = new Int16Array(uncompressedData.length);
            } else if (uncompressedData instanceof Uint16Array) {
                rgbData = new Uint16Array(uncompressedData.length);
            } else {
                const error = new Error(`unsuported typed array: ${uncompressedData}`);
                throw error;
            }

            // https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/src/decodeYBRFull.js
            let nPixels = uncompressedData.length / 3;
            let ybrIndex = 0;
            let rgbaIndex = 0;
            for (let i = 0; i < nPixels; i++) {
                let y = uncompressedData[ybrIndex++];
                let cb = uncompressedData[ybrIndex++];
                let cr = uncompressedData[ybrIndex++];
                rgbData[rgbaIndex++] = y + 1.402 * (cr - 128); // red
                rgbData[rgbaIndex++] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
                rgbData[rgbaIndex++] = y + 1.772 * (cb - 128); // blue
                // rgbData[rgbaIndex++] = 255; //alpha
            }
        } else {
            const error = new Error(
                `photometric interpolation not supported: ${photometricInterpretation}`
            );
            throw error;
        }

        return rgbData;
    }

    // used if OpenJPEG library isn't loaded (OHIF/image-JPEG2000 isn't supported and can't parse some images)

    // from cornerstone

    private _getUnitsName(value: number): string {
        const units: Record<number, string> = {
            0: 'none',
            1: 'percent',
            2: 'dB',
            3: 'cm',
            4: 'seconds',
            5: 'hertz',
            6: 'dB/seconds',
            7: 'cm/sec',
            8: 'cm2',
            9: 'cm2/sec',
            10: 'cm3',
            11: 'cm3/sec',
            12: 'degrees',
        };

        return units[value] ?? 'none';
    }
}
