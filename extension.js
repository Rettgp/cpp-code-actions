// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
var path = require("path");
var fs = require('fs');

function FindClassNamespace(text_doc, line_num) {
    let class_namespace = "";
    let class_line_num = line_num;
    while (class_line_num != 0)
    {
        let class_line_text = text_doc.lineAt(class_line_num).text;
        if (class_line_text.includes("class"))
        {
            let first_space = class_line_text.indexOf(" ") + 1;
            class_namespace = class_line_text.slice(first_space, class_line_text.indexOf(" ", first_space + 1)) + "::";
            break;
        }
        class_line_num--;
    }

    return class_namespace;
}

function ExtractFunctionDeclaration(text_doc, line_num) {
    let selection_line = text_doc.lineAt(line_num).text;
    let function_declaration = selection_line;
    let end_char = selection_line.charAt(selection_line.length - 1);
    let max_lookaheads = 3;
    while (end_char !== ';') {
        let next_line_num = line_num + 1;
        let next_selection_line = text_doc.lineAt(next_line_num).text;
        function_declaration += next_selection_line;
        end_char = next_selection_line.charAt(next_selection_line.length - 1);

        if (next_line_num > (line_num + max_lookaheads)) {
            return "";
        }
    }

    return function_declaration;
}

function InsertText(orig, replace, pos) {
    let modified = orig;
    let function_name_start_pos = pos;
    while (pos != -1 && pos < orig.length) {
        if (orig.charAt(pos) === "(") {
            modified = [orig.slice(0, function_name_start_pos + 1), replace, orig.slice(function_name_start_pos + 1)].join('');
            break;
        }
        if (orig.charAt(pos) === " ") {
            function_name_start_pos = pos;
        }
        pos++;
    }

    return modified;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("Extension Active");


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.CreateDefinition', function () {
        // The code you place here will be executed every time your command is executed
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === vscode.window.activeTextEditor.document && doc_listen_to_change) {
                vscode.window.activeTextEditor.revealRange(e.document.lineAt(e.document.lineCount - 1).range);
                doc_listen_to_change = false;
            }
        });

        let doc_listen_to_change = true;
        let active_editor = vscode.window.activeTextEditor
        let text_doc = active_editor.document;
        let selection_line_num = active_editor.selection.start.line;
        let function_declaration = ExtractFunctionDeclaration(text_doc, selection_line_num);

        if (!function_declaration.includes("("))
        {
            return;
        }

        let class_namespace = FindClassNamespace(text_doc, selection_line_num);

        let header_file_name = path.basename(text_doc.fileName);
        let cpp_file_name = header_file_name.replace(".h", ".cpp");
        let cpp_path = text_doc.fileName.replace(header_file_name, cpp_file_name);
        // Display a message box to the user
        fs.stat(cpp_path, function (err, stat) {
            if (err == null) {
                vscode.window.showInformationMessage(cpp_path);
                vscode.workspace.openTextDocument(cpp_path).then(doc => {
                    doc_listen_to_change = true;
                    vscode.window.showTextDocument(doc, { preserveFocus: false, preview: false }).then(editor => {
                        editor.edit(edit => {
                            function_declaration = function_declaration.replace(';', '');
                            function_declaration = function_declaration.replace(/\s+/g, ' ');
                            function_declaration = function_declaration.replace("virtual" ,"");
                            function_declaration = function_declaration.replace("override" ,"");
                            function_declaration = function_declaration.replace("static" ,"");
                            function_declaration = function_declaration.trim();

                            // Add class namespace
                            function_declaration = InsertText(function_declaration, class_namespace, function_declaration.indexOf(" "));

                            let function_header = "\r\n" + "//================================================================================" + "\r\n";
                            function_declaration =  function_header + function_declaration;
                            function_declaration += "\r\n{\r\n}\r\n"
                            edit.insert(doc.lineAt(doc.lineCount - 1).range.start, function_declaration);
                        }
                        );
                    });
                });
            } else {
                vscode.window.showInformationMessage("No cpp file found!");
            }
        });
    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    console.log("Extension Deactivated");
}
exports.deactivate = deactivate;