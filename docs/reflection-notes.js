/* Shared behaviour for the standard "Write down your thoughts" box (.reflection-notes).
   The "Download my notes" button (data-download-notes) saves the guide's questions plus
   the student's notes as a plain-text file. It never touches the applet's own data, so
   every applet's notes download looks and behaves the same. */
(function () {
  "use strict";
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-download-notes]");
    if (!button) return;
    var box = button.closest(".reflection-notes");
    var textarea = box && box.querySelector("textarea");
    if (!textarea) return;
    var status = box.querySelector("[data-download-status]");
    var titleEl = document.getElementById("activity-title");
    var title = ((titleEl && titleEl.textContent) || document.title).replace(/\s+/g, " ").trim();
    var questions = Array.prototype.map.call(
      document.querySelectorAll(".reflection-container > ol > li"),
      function (li, i) { return (i + 1) + ". " + li.textContent.replace(/\s+/g, " ").trim(); }
    );
    var text = "LING2150: " + title + "\n\n" +
      "Reflection & Discussion Guide\n" + questions.join("\n") + "\n\n" +
      "My notes\n" + textarea.value + "\n";
    var code = (title.match(/Activity\s+(\w+)/i) || [])[1] ||
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = "LING2150-" + code + "-notes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (status) status.textContent = "Download requested. Check your browser’s downloads.";
  });
})();
