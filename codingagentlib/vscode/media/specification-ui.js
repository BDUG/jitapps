/* Shared accessible questionnaire and editable, explicitly applied result. */
(function (root) {
  "use strict";
  root.CodingAgentSpecificationUI = {
    attach({
      input,
      button,
      generate,
      isBusy = () => false,
      changed = () => {},
    }) {
      const C = root.CodingAgentSpecification,
        el = (tag, text) => {
          const n = document.createElement(tag);
          if (text) n.textContent = text;
          return n;
        },
        dialog = el("dialog");
      dialog.className = "ca-specification";
      dialog.setAttribute("aria-label", "Create development specification");
      const heading = el("h2", "Create development specification"),
        intro = el(
          "p",
          "Answer what you know. Blank answers remain unresolved. Generate sends only this command and your answers to the configured LLM; it does not start the agent.",
        ),
        command = el("textarea"),
        commandLabel = el("label", "Command / goal");
      command.rows = 4;
      command.maxLength = 30000;
      commandLabel.append(command);
      const questions = el("div"),
        inputs = {};
      for (const f of C.fields) {
        const label = el("label", f.label),
          field = el("textarea");
        field.rows = 2;
        field.maxLength = 4000;
        field.placeholder = f.hint;
        label.append(field);
        inputs[f.id] = field;
        questions.append(label);
      }
      const actions = el("div"),
        make = el("button", "Generate specification"),
        cancel = el("button", "Close"),
        apply = el("button", "Use specification"),
        previewLabel = el("label", "Generated specification · editable draft"),
        preview = el("textarea"),
        status = el("p");
      actions.className = "ca-spec-actions";
      preview.rows = 14;
      previewLabel.append(preview);
      previewLabel.hidden = true;
      apply.disabled = true;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      actions.append(make, apply, cancel);
      dialog.append(
        heading,
        intro,
        commandLabel,
        questions,
        actions,
        previewLabel,
        status,
      );
      document.body.append(dialog);
      let original = "",
        source = null,
        abort = null,
        serial = 0,
        valid = false;
      const invalidate = () => {
        valid = false;
        apply.disabled = true;
        if (preview.value)
          status.textContent =
            "Command or answers changed. Generate a new specification before using it.";
      };
      for (const field of [command, ...Object.values(inputs)])
        field.addEventListener("input", invalidate);
      function close() {
        serial++;
        abort?.abort();
        abort = null;
        make.disabled = false;
        dialog.close();
      }
      cancel.onclick = close;
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        close();
      });
      button.onclick = () => {
        if (isBusy()) {
          return;
        }
        original = input.value;
        command.value = original;
        preview.value = "";
        previewLabel.hidden = true;
        valid = false;
        apply.disabled = true;
        status.textContent =
          "Review the command and optional questionnaire before generating.";
        if (!dialog.open) dialog.showModal();
        command.focus();
      };
      make.onclick = async () => {
        if (abort) return;
        const token = ++serial;
        try {
          if (isBusy())
            throw Error(
              "Finish the active agent operation before creating a specification.",
            );
          source = C.input(
            command.value,
            Object.fromEntries(
              Object.entries(inputs).map(([k, v]) => [k, v.value]),
            ),
          );
          const sent = JSON.stringify(source);
          abort = new AbortController();
          make.disabled = true;
          apply.disabled = true;
          status.textContent =
            "Generating a specification… No agent actions are being executed.";
          const result = await generate(source, abort.signal);
          if (token !== serial || abort.signal.aborted) return;
          const current = C.input(
            command.value,
            Object.fromEntries(
              Object.entries(inputs).map(([k, v]) => [k, v.value]),
            ),
          );
          if (JSON.stringify(current) !== sent)
            throw Error(
              "Command or answers changed during generation. Generate again.",
            );
          preview.value = C.markdown(C.parse(result), source);
          previewLabel.hidden = false;
          valid = true;
          apply.disabled = false;
          status.textContent =
            "Review and edit the specification, then choose Use specification. The agent has not started.";
          preview.focus();
        } catch (e) {
          if (token === serial)
            status.textContent =
              e.message ||
              "Specification generation failed. Your command is unchanged.";
        } finally {
          if (token === serial) {
            abort = null;
            make.disabled = false;
          }
        }
      };
      apply.onclick = () => {
        if (!valid || abort) return;
        if (isBusy() || input.disabled || input.readOnly) {
          status.textContent =
            "Finish the active operation before replacing the command.";
          return;
        }
        if (input.value !== original) {
          status.textContent =
            "The command input changed while this dialog was open. Close and reopen to use the latest command; your draft was preserved.";
          return;
        }
        if (
          !preview.value.trim() ||
          preview.value.length >
            (input.maxLength > 0 ? input.maxLength : 100000)
        ) {
          status.textContent =
            "The specification is empty or exceeds the command input limit. Shorten the preview.";
          return;
        }
        input.value = preview.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        changed();
        close();
        input.focus();
      };
      return { dialog };
    },
  };
})(window);
