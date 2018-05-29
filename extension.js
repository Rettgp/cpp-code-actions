// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
'use strict';

const vscode = require('vscode');
var path = require("path");
var fs = require('fs');
var glob = require('glob');

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
    let max_lookaheads = 2;
    let next_line_num = line_num + 1;
    while (end_char !== ';') {
        if (end_char === '}') {
            return "";
        }
        let next_selection_line = text_doc.lineAt(next_line_num).text;
        function_declaration += next_selection_line;
        end_char = next_selection_line.charAt(next_selection_line.length - 1);

        if (next_line_num > (line_num + max_lookaheads)) {
            return "";
        }

        next_line_num++;
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

function FindNextDeclaration(text_doc, line_num) {
    let next_line_text = ""
    let end_of_function = 0;
    let started_def_lookup = false
    let cur_line_num = line_num;
    let skip_signals = false;
    for (let i = cur_line_num; i < text_doc.lineCount - 1; ++i) {
        let line_text = text_doc.lineAt(i).text;

        if (line_text.includes("signals:")) {
            skip_signals = true;
            next_line_text = "";
        }
        
        if (line_text.includes("protected") || line_text.includes("private") || line_text.includes("public")) {
            skip_signals = false;
        }

        if (skip_signals) {
            continue;
        }

        if (started_def_lookup) {
            next_line_text += line_text;
        }

        if (line_text.includes("(") && !line_text.endsWith("}") && !started_def_lookup) {
            started_def_lookup = true;
            next_line_text = line_text;
        }

        if (line_text.includes(";") && started_def_lookup) {
            break;
        }
    }

    return next_line_text;
}

function CreateHighlightDecoration(alpha) {
    return vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(0,122,255,' + alpha + ')' });
}

function HighlightUpdate(lines) {
    let highlight_alpha = 0.5;
    let highlight_dec = CreateHighlightDecoration(highlight_alpha);
    highlight_alpha = 0.35;

    vscode.window.activeTextEditor.setDecorations(highlight_dec, lines);
    setTimeout(function() {
        function update() {
            vscode.window.activeTextEditor.setDecorations( highlight_dec, []);
            highlight_alpha -= 0.025;
            highlight_alpha = Math.max(highlight_alpha, 0.0);
            highlight_dec = CreateHighlightDecoration(highlight_alpha);
            vscode.window.activeTextEditor.setDecorations( highlight_dec, lines);
            if ( highlight_alpha > 0.0 ) {
                setTimeout(function() {
                    update();
                }, 100);
            }
        }

        update();
    }, 100)
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    glob("/opt/remote/share/vscode-extensions/cpp-code-actions-*.vsix", function (er, files) {
        // files is an array of filenames.
        // If the `nonull` option is set, and nothing
        // was found, then files is ["**/*.js"]
        // er is an error object or null.
        if (er || files.length == 0 ) {
            return;
        }

        let update_available = false
        let current_ver = vscode.extensions.getExtension('gphelps.cpp-code-actions').packageJSON.version;
        let server_ver = path.basename(files[0]).replace("cpp-code-actions-", "").replace(".vsix", "");
        if (server_ver[0] > current_ver[0]) {
            update_available = true;
        } else if (server_ver[2] > current_ver[2]) {
            update_available = true;
        } else if (server_ver[4] > current_ver[4]) {
            update_available = true;
        }
        if (update_available) {
            vscode.window.showInformationMessage('Update is avaiable for cpp-code-actions. Update now?', 'Yes', 'Later') .then(selection => {
                if (selection === "Yes") {
                    vscode.commands.executeCommand("workbench.extensions.action.installVSIX") ;
                }
            });
        }
    })


    let added_line_num = 0;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('cpp-code-actions.CreateDefinition', function () {
        // The code you place here will be executed every time your command is executed
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === vscode.window.activeTextEditor.document && doc_listen_to_change) {

                vscode.window.activeTextEditor.revealRange(e.document.lineAt(added_line_num).range);
                let highlight_lines = [e.document.lineAt(added_line_num + 2).range, 
                    e.document.lineAt(added_line_num + 3).range, 
                    e.document.lineAt(added_line_num + 4).range, 
                    e.document.lineAt(added_line_num + 5).range];
                HighlightUpdate(highlight_lines);

                doc_listen_to_change = false;
            }
        });

        let doc_listen_to_change = true;
        let active_editor = vscode.window.activeTextEditor
        let text_doc = active_editor.document;
        let selection_line_num = active_editor.selection.start.line;
        let function_definition = ExtractFunctionDeclaration(text_doc, selection_line_num);

        if (!function_definition.includes("(")) {
            vscode.window.showErrorMessage("Cannot create definition for this function!");
            return;
        }

        let class_namespace = FindClassNamespace(text_doc, selection_line_num);

        let next_line_text = FindNextDeclaration(text_doc, selection_line_num + 1);
        next_line_text = next_line_text.replace(/\s+/g, ' ');
        next_line_text = next_line_text.replace("virtual", "");
        next_line_text = next_line_text.replace("override", "");
        next_line_text = next_line_text.replace("static", "");
        next_line_text = next_line_text.trim();
        next_line_text = next_line_text.slice(0, next_line_text.indexOf("(") + 1);
        let next_function_def = InsertText(next_line_text, class_namespace, next_line_text.lastIndexOf(" "));

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
                            function_definition = function_definition.replace(';', '');
                            function_definition = function_definition.replace(/\s+/g, ' ');
                            function_definition = function_definition.replace("virtual" ,"");
                            function_definition = function_definition.replace("override" ,"");
                            function_definition = function_definition.replace("static" ,"");
                            function_definition = function_definition.trim();

                            // Add class namespace
                            if (function_definition.indexOf(" ") == -1) {
                                function_definition = class_namespace + function_definition;
                            } else {
                                function_definition = InsertText(function_definition, class_namespace, function_definition.indexOf(" "));
                            }

                            let function_header = "\r\n\r\n" + "//================================================================================" + "\r\n";
                            function_definition =  function_header + function_definition;
                            function_definition += "\r\n{\r\n}";

                            // Find the line above the next function definition so it can insert the new definition
                            let line_insert = doc.lineCount - 1;
                            let found_viable_insert_line = false;
                            for (let i = doc.lineCount - 1; i >= 0; --i) {
                                let line = doc.lineAt(i).text;
                                if (found_viable_insert_line && line === "}") {
                                    line_insert = i;
                                    break;
                                }
                                if (!found_viable_insert_line && line.includes(next_function_def)) {
                                    found_viable_insert_line = true;
                                }
                            }

                            added_line_num = line_insert;
                            edit.insert(doc.lineAt(line_insert).range.end, function_definition);
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

