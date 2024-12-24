import * as dicomParser from 'dicom-parser';

interface DicomFile {
    file: File;
    SOPInstanceUID: string;
    sliceLocation?: number;
    imagePositionZ?: number;
    instanceNumber?: number;
}

interface Series {
    seriesInstanceUID: string;
    dicomFiles: DicomFile[];
}

const sortDicomFiles = (dicomFiles: DicomFile[]): DicomFile[] => {
    return dicomFiles.sort((a, b) => {
        // Сортировка по SliceLocation
        if (a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
            return a.sliceLocation - b.sliceLocation;
        }
        // Сортировка по Image Position Z
        if (a.imagePositionZ !== undefined && b.imagePositionZ !== undefined) {
            return a.imagePositionZ - b.imagePositionZ;
        }
        // Сортировка по Instance Number
        if (a.instanceNumber !== undefined && b.instanceNumber !== undefined) {
            return a.instanceNumber - b.instanceNumber;
        }

        return 0;
    });
};

export const preloader = async (files: FileList | File[]): Promise<Series[]> => {
    const seriesMap = new Map<string, DicomFile[]>();

    for (const file of Array.from(files)) {
        try {
            const arrayBuffer = await file.arrayBuffer();

            const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));

            const seriesUID = dataSet.string('x0020000e') || 'unknown';
            const sopInstanceUID = dataSet.string('x00080018') || 'unknown';

            const sliceLocation = dataSet.floatString('x00201041'); // SliceLocation
            const imagePositionZ = dataSet.string('x00200032')?.split('\\').map(parseFloat)[2];
            const instanceNumber = dataSet.intString('x00200013');

            const dicomFile: DicomFile = {
                file,
                sliceLocation: sliceLocation,
                SOPInstanceUID: sopInstanceUID,
                imagePositionZ: imagePositionZ,
                instanceNumber: instanceNumber,
            };

            // Группируем по seriesUID
            if (!seriesMap.has(seriesUID)) {
                seriesMap.set(seriesUID, []);
            }
            seriesMap.get(seriesUID)?.push(dicomFile);
        } catch (error) {
            console.error(`Error parsing DICOM file: ${file.name}`, error);
        }
    }

    // Преобразуем Map в массив Series[] и сортируем снимки по sliceLocation/imagePositionZ/instanceNumber
    const seriesArray: Series[] = [];
    seriesMap.forEach((unsortedDicomFiles, seriesInstanceUID) => {
        const sortedDicomFiles = sortDicomFiles(unsortedDicomFiles);
        seriesArray.push({ seriesInstanceUID, dicomFiles: sortedDicomFiles });
    });

    return seriesArray;
};
