/** Rs 500, or Rs 499.50: how money reads in messages. */
export const rupees = (paisa: number) => `Rs ${paisa % 100 === 0 ? paisa / 100 : (paisa / 100).toFixed(2)}`;
