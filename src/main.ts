import './style.css';
import typescriptLogo from './typescript.svg';
import viteLogo from '/vite.svg';
import { setupCounter } from './counter.ts';
import { Matrix4, Vector3 } from 'three';
import DicomParser from './parser.dicom.ts';
import { preloader } from './preloader.ts';

const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const loadButton = document.getElementById('loadButton') as HTMLButtonElement;

loadButton.addEventListener('click', async () => {
    const files = fileInput.files; // Получаем выбранный файл

    if (files) {
        const series = await preloader(files);
        console.log(series);
    }
});

// class SomeClassName {
//     public dicomParser: DicomParser;
//     public spacing: [xSpacing: number, ySpacing: number, zSpacing: number];
//     public ijk2lps: Matrix4;
//     public lps2ijk: Matrix4;

//     constructor(dicomParser: DicomParser) {
//         this.ijk2lps = Utils.ijk2lps();
//         this.lps2ijk = this.ijk2lps.clone().invert();

//         if (dicomParser.pixelSpacing()) {
//         } else this.spacing = [1, 0, 1];
//     }
// }

// class Utils {
//     /**
//      *
//      *
//      * @param o
//      * @param i
//      * @param j
//      * @param k
//      */
//     public static ijk2lps(o: Vector3, i: Vector3, j: Vector3, k: Vector3) {
//         return new Matrix4().makeBasis(i, j, k).setPosition(o);
//     }
// }
