// Square-system linear algebra for rigid-body statics. Copy inputs and choose
// the largest available pivot in each column before eliminating below it.
export const ZERO_TOL = 1e-12;

export function solveLinear(matrix, rhs) {
  const n=matrix.length;
  if (!n || rhs.length!==n || matrix.some(row => row.length!==n)) {
    throw new Error('solveLinear: expected a square matrix and matching right-hand side');
  }
  const a=matrix.map((row,i) => [...row,rhs[i]]);
  if (a.some(row => row.some(v => !Number.isFinite(v)))) throw new Error('solveLinear: non-finite input');
  for (let col=0;col<n;col++) {
    let pivot=col;
    for (let row=col+1;row<n;row++) {
      if (Math.abs(a[row][col])>Math.abs(a[pivot][col])) pivot=row;
    }
    if (Math.abs(a[pivot][col])<ZERO_TOL) throw new Error('solveLinear: singular matrix');
    [a[col],a[pivot]]=[a[pivot],a[col]];
    for (let row=col+1;row<n;row++) {
      const factor=a[row][col]/a[col][col];
      a[row][col]=0;
      for (let j=col+1;j<=n;j++) a[row][j]-=factor*a[col][j];
    }
  }
  const answer=Array(n).fill(0);
  for (let row=n-1;row>=0;row--) {
    let value=a[row][n];
    for (let col=row+1;col<n;col++) value-=a[row][col]*answer[col];
    answer[row]=value/a[row][row];
  }
  return answer;
}
