// -----------------------------------------------------------------------------
// MIT License
//
// Copyright (c) 2020 Ivo Steinbrecher
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// -----------------------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace L2A.FORMS
{
    public partial class Item : BaseForm
    {
        public Item(L2A.UTIL.ParameterList parameter_list, string return_xml) : base(return_xml)
        {
            InitializeComponent();

            input_parameter_list_ = parameter_list;
            L2A.UTIL.ParameterList property_list = input_parameter_list_.sub_lists_["property_list"];

            // Set the position item.
            SetPosition(property_list.options_["text_align_horizontal"], property_list.options_["text_align_vertical"]);

            // Set the placement options.
            SetPlacementOption(property_list.options_["placed_option"]);

            // Set the latex code.
            textbox.Text = property_list.sub_lists_["latex"].main_option_;

            InitializeParagraphControls();

            // Set the position of the cursor in the text box.
            int cursor_position = Int32.Parse(property_list.sub_lists_["latex"].options_["cursor_position"]);
            textbox.SelectionStart = Math.Max(0, Math.Min(cursor_position, textbox.TextLength));
            textbox.SelectionLength = 0;

            // Set the textbox to be active.
            ActiveControl = textbox;

            // Set the redo boundary box relatex stuff in the form.
            string boundary_box_state = input_parameter_list_.options_["boundary_box_state"];
            if (boundary_box_state == "none")
                group_boundary_box.Visible = false;
            else
            {
                group_boundary_box.Visible = true;
                if (boundary_box_state == "ok")
                {
                    boundary_box_status.Text = "Ok";
                    rebo_boundary_box.Enabled = false;
                }
                else if (boundary_box_state == "streched")
                    boundary_box_status.Text = "Streched";
                else if (boundary_box_state == "diamond")
                    boundary_box_status.Text = "Bend";
            }

            // Set the redo latex related stuff.
            string latex_exists = input_parameter_list_.options_["latex_exists"];
            if (latex_exists == "0")
                group_latex.Visible = false;
            else
                group_latex.Visible = true;
        }

        private void SetPosition(string text_align_horizontal, string text_align_vertical)
        {
            if (text_align_horizontal == "left")
            {
                if (text_align_vertical == "top")
                    pos_0.Checked = true;
                else if (text_align_vertical == "centreV")
                    pos_3.Checked = true;
                else if (text_align_vertical == "baseline")
                    pos_6.Checked = true;
                else if (text_align_vertical == "bottom")
                    pos_9.Checked = true;
                else
                    L2A.ERR.ExceptionClass.Exception("Position could not be set!");
            }
            else if (text_align_horizontal == "centreH")
            {
                if (text_align_vertical == "top")
                    pos_1.Checked = true;
                else if (text_align_vertical == "centreV")
                    pos_4.Checked = true;
                else if (text_align_vertical == "baseline")
                    pos_7.Checked = true;
                else if (text_align_vertical == "bottom")
                    pos_10.Checked = true;
                else
                    L2A.ERR.ExceptionClass.Exception("Position could not be set!");
            }
            else if (text_align_horizontal == "right")
            {
                if (text_align_vertical == "top")
                    pos_2.Checked = true;
                else if (text_align_vertical == "centreV")
                    pos_5.Checked = true;
                else if (text_align_vertical == "baseline")
                    pos_8.Checked = true;
                else if (text_align_vertical == "bottom")
                    pos_11.Checked = true;
                else
                    L2A.ERR.ExceptionClass.Exception("Position could not be set!");
            }
            else
                L2A.ERR.ExceptionClass.Exception("Position could not be set!");

        }

        private void SetPlacementOption(string placement_option)
        {
            if (placement_option == "fill_to_boundary_box")
            {
                strech.Checked = true;
                clip_check_box.Checked = false;
                return;
            }
            else if (placement_option == "keep_scale")
            {
                original_size.Checked = true;
                clip_check_box.Checked = false;
                return;
            }
            else if (placement_option == "keep_scale_clip")
            {
                original_size.Checked = true;
                clip_check_box.Checked = true;
                return;
            }
            L2A.ERR.ExceptionClass.Exception("Placement could not be set!");
        }

        private void OkClick(object sender, EventArgs e)
        {
            try { this.StoreValues(); }
            catch (FormatException error)
            {
                MessageBox.Show(this, error.Message, "Check paragraph", MessageBoxButtons.OK, MessageBoxIcon.Information);
                textbox.Focus();
                return;
            }
            if (paragraph_mode_.Checked && editable_text_.Checked)
            {
                string source = textbox.Text;
                decimal width = paragraph_width_.Value, font = paragraph_font_.Value;
                preparing_ = true; Enabled = false; UseWaitCursor = true;
                paragraph_help_.Text = "Preparing editable text and vector formulas...";
                Task.Factory.StartNew(() => L2A.UTIL.EditableParagraph.Prepare(source, width, font)).ContinueWith(task => {
                    preparing_ = false; Enabled = true; UseWaitCursor = false; UpdateParagraphHelp();
                    if (task.IsFaulted) {
                        MessageBox.Show(this, task.Exception.GetBaseException().Message, "Check paragraph", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }
                    try {
                        string folder = task.Result;
                        L2A.UTIL.EditableParagraph.Launch(folder);
                        return_parameter_list_.sub_lists_["latex"].main_option_ += "\n%L2A-EDITABLE-JOB:" + System.IO.Path.GetFileName(folder) + "\n";
                        form_result_ = "ok";
                        Close();
                    } catch (Exception error) {
                        MessageBox.Show(this, error.Message, "Editable paragraph", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }, TaskScheduler.FromCurrentSynchronizationContext());
                return;
            }
            this.form_result_ = "ok";
            this.Close();
        }

        private void CancelClick(object sender, EventArgs e)
        {
            this.Close();
        }

        private bool FormIsChanged()
        {
            try { StoreValues(); }
            catch (FormatException) { return true; }
            L2A.UTIL.ParameterList property_list = input_parameter_list_.sub_lists_["property_list"];
            return return_parameter_list_.options_["text_align_horizontal"] != property_list.options_["text_align_horizontal"] ||
                return_parameter_list_.options_["text_align_vertical"] != property_list.options_["text_align_vertical"] ||
                return_parameter_list_.options_["placed_option"] != property_list.options_["placed_option"] ||
                return_parameter_list_.sub_lists_["latex"].main_option_ != property_list.sub_lists_["latex"].main_option_;
        }

        private void RedoBoundaryClick(object sender, EventArgs e)
        {
            if (FormIsChanged())
            {
                DialogResult dialog_result = MessageBox.Show("Some values of the item changed. If you continue with Redo Boundary Box the changes will be lost. Do you want to continue?", "LaTeX2AI", MessageBoxButtons.OKCancel);
                // The user wants to continue editing the form.
                if (dialog_result == DialogResult.Cancel) return;
            }

            this.form_result_ = "redo_boundary_box";
            this.Close();
        }

        private void RedoLaTeXClick(object sender, EventArgs e)
        {
            if (FormIsChanged())
            {
                DialogResult dialog_result = MessageBox.Show("Some values of the item changed. If you continue with Redo LaTeX the changes will be lost. Do you want to continue?", "LaTeX2AI", MessageBoxButtons.OKCancel);
                // The user wants to continue editing the form.
                if (dialog_result == DialogResult.Cancel) return;
            }

            this.form_result_ = "redo_latex";
            this.Close();
        }

        public override void ThisFormClosed(object sender, FormClosedEventArgs e)
        {
            base.ThisFormClosed(sender, e);
        }

        private void FormKeyDown(object sender, KeyEventArgs e)
        {
            // Close if escape is hit.
            if (e.KeyCode == Keys.Escape)
            {
                e.SuppressKeyPress = true;
                CancelClick(sender, e);
                return;
            }

            if (e.KeyCode == Keys.Enter)
            {
                // Paragraphs use normal Enter for newlines and Ctrl+Enter to submit.
                if (paragraph_mode_.Checked)
                {
                    if (e.Control)
                    {
                        e.SuppressKeyPress = true;
                        OkClick(sender, e);
                    }
                    return;
                }
                // Check if shift key is down.
                if (Control.ModifierKeys == Keys.Shift)
                {
                    return;
                }
                else
                {
                    // Press ok when enter is hit.
                    e.SuppressKeyPress = true;
                    OkClick(sender, e);
                }
            }
        }

        private void PlacementCheckedChanged(object sender, EventArgs e)
        {
            // If the item is deactivated, the cliped box is also deactivated.
            if (this.original_size.Checked == true)
            {
                this.clip_check_box.Enabled = true;
            }
            else
            {
                this.clip_check_box.Enabled = false;
            }
        }

        protected override void StoreValues()
        {
            base.StoreValues();

            // Set the placement options.
            if (strech.Checked == true)
                return_parameter_list_.options_["placed_option"] = "fill_to_boundary_box";
            else if (original_size.Checked == true && clip_check_box.Checked == false)
                return_parameter_list_.options_["placed_option"] = "keep_scale";
            else if (original_size.Checked == true && clip_check_box.Checked == true)
                return_parameter_list_.options_["placed_option"] = "keep_scale_clip";
            else L2A.ERR.ExceptionClass.Exception("Can not write placed options!");

            // Set the position options.
            if (pos_0.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "left";
                return_parameter_list_.options_["text_align_vertical"] = "top";
            }
            else if (pos_1.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "centreH";
                return_parameter_list_.options_["text_align_vertical"] = "top";
            }
            else if (pos_2.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "right";
                return_parameter_list_.options_["text_align_vertical"] = "top";
            }
            else if (pos_3.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "left";
                return_parameter_list_.options_["text_align_vertical"] = "centreV";
            }
            else if (pos_4.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "centreH";
                return_parameter_list_.options_["text_align_vertical"] = "centreV";
            }
            else if (pos_5.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "right";
                return_parameter_list_.options_["text_align_vertical"] = "centreV";
            }
            else if (pos_6.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "left";
                return_parameter_list_.options_["text_align_vertical"] = "baseline";
            }
            else if (pos_7.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "centreH";
                return_parameter_list_.options_["text_align_vertical"] = "baseline";
            }
            else if (pos_8.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "right";
                return_parameter_list_.options_["text_align_vertical"] = "baseline";
            }
            else if (pos_9.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "left";
                return_parameter_list_.options_["text_align_vertical"] = "bottom";
            }
            else if (pos_10.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "centreH";
                return_parameter_list_.options_["text_align_vertical"] = "bottom";
            }
            else if (pos_11.Checked == true)
            {
                return_parameter_list_.options_["text_align_horizontal"] = "right";
                return_parameter_list_.options_["text_align_vertical"] = "bottom";
            }
            else
                L2A.ERR.ExceptionClass.Exception("Can not write position!");

            // Set the latex text options.
            return_parameter_list_.sub_lists_["latex"] = new L2A.UTIL.ParameterList();
            return_parameter_list_.sub_lists_["latex"].main_option_ = paragraph_mode_.Checked ?
                L2A.UTIL.Paragraph.Encode(textbox.Text, paragraph_width_.Value, paragraph_font_.Value) : textbox.Text;
            return_parameter_list_.sub_lists_["latex"].options_["cursor_position"] = textbox.SelectionStart.ToString();
        }

        //! Parameter list with the given options from the main application.
        protected L2A.UTIL.ParameterList input_parameter_list_;

        private CheckBox paragraph_mode_;
        private CheckBox editable_text_;
        private bool preparing_;
        private NumericUpDown paragraph_width_;
        private NumericUpDown paragraph_font_;
        private Label paragraph_help_;
        private bool switching_mode_;

        private void InitializeParagraphControls()
        {
            // Keep this layout separate from the upstream designer-generated form.
            ClientSize = new Size(940, 480);
            MinimumSize = new Size(956, 519);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true;
            button_ok.Left = ClientSize.Width - button_ok.Width - 12;
            button_cancel.Left = button_ok.Left;
            button_ok.Anchor = button_cancel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            group_text.Size = new Size(ClientSize.Width - group_text.Left - 12, ClientSize.Height - group_text.Top - 12);
            group_text.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            group_text.Text = "Text and formulas";

            paragraph_mode_ = new CheckBox { Name = "paragraph_mode", Text = "Paragraph + math", AutoSize = true, Location = new Point(10, 24) };
            var widthLabel = new Label { Text = "Width (mm)", AutoSize = true, Location = new Point(180, 26) };
            paragraph_width_ = new NumericUpDown { Name = "paragraph_width", AccessibleName = "Paragraph width in millimeters", Minimum = 10, Maximum = 400, DecimalPlaces = 1, Value = 90, Location = new Point(252, 22), Width = 64 };
            var fontLabel = new Label { Text = "Font (pt)", AutoSize = true, Location = new Point(340, 26) };
            paragraph_font_ = new NumericUpDown { Name = "paragraph_font", AccessibleName = "Paragraph font size in points", Minimum = 6, Maximum = 72, DecimalPlaces = 1, Value = 11, Location = new Point(400, 22), Width = 64 };
            editable_text_ = new CheckBox { Name = "editable_text", Text = "Editable AI text (Times New Roman)", AutoSize = true, Checked = true, Location = new Point(10, 54) };
            FormClosing += (sender, e) => { if (preparing_) e.Cancel = true; };
            paragraph_width_.Left = widthLabel.Right + 12;
            fontLabel.Left = paragraph_width_.Right + 24;
            paragraph_font_.Left = fontLabel.Right + 12;
            textbox.Location = new Point(10, 88);
            textbox.Size = new Size(group_text.ClientSize.Width - 20, group_text.ClientSize.Height - 147);
            textbox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            textbox.AcceptsTab = true;
            textbox.DetectUrls = false;
            paragraph_help_ = new Label { Location = new Point(10, group_text.ClientSize.Height - 53), Size = new Size(group_text.ClientSize.Width - 20, 46), Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right };
            group_text.Controls.AddRange(new Control[] { paragraph_mode_, widthLabel, paragraph_width_, fontLabel, paragraph_font_, editable_text_, paragraph_help_ });

            string source;
            decimal width, font;
            if (L2A.UTIL.Paragraph.TryDecode(textbox.Text, out source, out width, out font))
            {
                textbox.Text = source;
                paragraph_width_.Value = width;
                paragraph_font_.Value = font;
                paragraph_mode_.Checked = true;
            }
            paragraph_mode_.CheckedChanged += ParagraphModeChanged;
            UpdateParagraphHelp();
        }

        private void ParagraphModeChanged(object sender, EventArgs e)
        {
            if (switching_mode_) return;
            switching_mode_ = true;
            try
            {
                if (paragraph_mode_.Checked)
                {
                    string source;
                    decimal width, font;
                    if (L2A.UTIL.Paragraph.TryDecode(textbox.Text, out source, out width, out font))
                    {
                        textbox.Text = source;
                        paragraph_width_.Value = width;
                        paragraph_font_.Value = font;
                    }
                    original_size.Checked = true;
                    pos_0.Checked = true;
                }
                else textbox.Text = L2A.UTIL.Paragraph.Encode(textbox.Text, paragraph_width_.Value, paragraph_font_.Value);
            }
            catch (FormatException error)
            {
                paragraph_mode_.Checked = true;
                MessageBox.Show(this, error.Message, "Check paragraph", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            finally { switching_mode_ = false; UpdateParagraphHelp(); }
        }

        private void UpdateParagraphHelp()
        {
            editable_text_.Enabled = paragraph_width_.Enabled = paragraph_font_.Enabled = paragraph_mode_.Checked;
            paragraph_help_.Text = paragraph_mode_.Checked ?
                "English text + $inline math$ / $$display math$$. Enter: newline; Ctrl+Enter: insert.\nEditable AI text creates text runs and vector formulas. Edits do not reflow the layout." :
                "Raw LaTeX. Enter: insert; Shift+Enter: newline.\nEnable Paragraph + math to wrap pasted prose to a fixed width.";
        }
    }
}
