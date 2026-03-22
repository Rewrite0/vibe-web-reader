import { snackbar } from 'mdui';

type SnackbarOptions = Parameters<typeof snackbar>[0];

export function showSnackbar(options: SnackbarOptions) {
  return snackbar({
    ...options,
    closeable: true,
  });
}
