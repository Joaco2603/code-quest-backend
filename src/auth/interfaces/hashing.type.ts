export interface Hash {
    hashing<T>(password, saltPassword): string;
    compareHash<T>(password, userPassword): boolean;
}