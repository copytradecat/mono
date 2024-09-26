export const truncatedString = (longString: string, maxLength: number) => { 
    return longString.substring(0, maxLength) + '...' + longString.substring(longString.length - maxLength)
}