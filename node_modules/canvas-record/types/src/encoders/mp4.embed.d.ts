declare function OA(c?: number): {
    contents: () => Uint8Array<ArrayBuffer>;
    seek: (e: any) => void;
    write: (e: any) => any;
};
declare function Fg(c: any, D?: {}): {
    end(): Promise<Uint8Array<ArrayBuffer>>;
    addFrame(w: any): Promise<void>;
    flush(): Promise<void>;
};
declare function Gg(D: any): any;
declare function _A(): boolean;
export { OA as createFile, Fg as createWebCodecsEncoderWithModule, Gg as default, _A as isWebCodecsSupported };
