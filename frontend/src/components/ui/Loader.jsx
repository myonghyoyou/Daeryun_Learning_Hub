export default function Loader({ visible, message }) {
  if (!visible) return null;
  return (
    <div className="flex h-screen items-center justify-center text-sm text-gray-500">
      {message}
    </div>
  );
}
