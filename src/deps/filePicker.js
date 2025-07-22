export const createFilePicker = () => {
  return {
    open: (options = {}) => {
      return new Promise((resolve, reject) => {
        const {
          accept = "*/*",
          multiple = false,
          // maxSize can be implemented in the future
        } = options;

        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = "none";

        input.onchange = (event) => {
          const files = Array.from(event.target.files || []);
          document.body.removeChild(input);

          // Always return an array, even for single file selection
          resolve(files);
        };

        input.oncancel = () => {
          document.body.removeChild(input);
          resolve([]);
        };

        // Handle case where user closes dialog without selecting
        input.onerror = () => {
          document.body.removeChild(input);
          reject(new Error("File picker error"));
        };

        document.body.appendChild(input);
        input.click();
      });
    },
  };
};
