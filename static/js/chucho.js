/**
 * chucho/static/js/chucho.js
 *
 * Contributing Authors:
 *    Evan Salazar   (Visgence, Inc.)
 *    Jeremiah Davis (Visgence, Inc.)
 *    Bretton Murphy (Visgence, Inc.)
 *
 * Copyright 2013, Visgence, Inc.
 *
 * This is the javascript that drives our chucho interface.  It defines the DataGrid object, which will
 * be instantiated for each different type of grid that is created.
 */


(function($) {
    /* Extra html for grids  */
    var add_button = '<input type="button" value="Add" onclick="myGrid.add_record();"/>';
    var delete_button = '<input type="button" value="Delete" onclick="myGrid.delete_row();"/>';
    var edit_button = '<input type="button" value="Edit" onclick="myGrid.edit_record();"/>';
    var refresh_button = '<input type="button" value="Refresh" onclick="myGrid.refresh();"/>';
    var message_span = '<span id="server_messages" style="padding-left:1em"></span>';

    function option_element(value, text, is_selected) {
        var option = $('<option>', {
            value: value,
            text: text
        });

        if ( is_selected )
            option.attr('selected', 'selected');

        return option;
    }

    /* Grid configuration */
    function DataGrid() {
        /** This is the object that contains the data.  It allows for more
         *  dynamic data in the grid.
         */
        this.model = {
            data: [],
            getItem: function(i) {
                return this.data[i];
            },
            getItemMetaData: function(i) {
                return null;
            },
            getLength: function() {
                return this.data.length;
            },
            get_pk: function(i) {
                return this.data[i].pk;
            },
            get_cell_data: function(i, j) {
                return this.data[i][j];
            },
            setItem: function(i, item) {
                this.data[i] = item;
            },
            set_data: function(new_data) {
                this.data = new_data;
            },
            add_data: function(row, i) {
                this.data.splice(i, 0, row); 
            },
            remove_data: function(i) {
                this.data.splice(i, 1);
            }
        };

        /** This is the name of the django model to we are creating the grid for. */
        this.model_name = '';

        /** This is the name of the django app that knows about the model */
        this.app_name = '';

        /** The column definition for the grid.  This is loaded via ajax. */
        this.columns = null;

        /** Return the columns to be displayed by slickgrid */
        this.grid_columns = function() {
            var columns = $.map(this.columns, function(c, i) {
                if ( c.grid_column)
                    return c;
                else
                    return undefined;
            });
            return columns;
        };

        /** Return the columns allowed to filter by. */
        this.filter_columns = function() {
            var columns = $.map(this.columns, function(c, i) {
                if ( c.filter_column === false )
                    return undefined;
                else if ( c.filter_column || c.grid_column )
                    return c;
                return undefined;
            });
            return columns;
        };

        /** These are the slickGrid options.*/
        this.options = {
            enableCellNavigation: true,
            forceFitColumns: true,
            enableColumnReorder: true,
            fullWidthRows: true,
            showTopPanel: true,
            forceSyncScrolling: true
        };

        this.grid = null;

        /** The columns and operators that we can filter over for this grid. */
        this.filter_operators = null;

        /** Determines whether or not we want to allow the user to only view data or edit it. */
        this.read_only = true;

        this.set_read_only = function(read_only) {
            this.read_only = read_only;
            var panel = this.grid.getTopPanel();

            var add = $(panel).children('input[value="Add"]');
            if(self.read_only) {
                if($(add).length > 0)
                    $(add).remove();
            }
            else {
                if($(add).length <= 0)
                    $(add_button).prependTo(panel);
            }
        };

        /** Method to get data from server and refresh the grid.*/
        this.refresh = function(page) {
            self = this;
            this.clear_row_selection();
            
            var spinner = get_spinner();
            spinner.spin();
            var styles = { 
                'display': 'inline',
                'bottom':  '6px'
            };  
            $(spinner.el).css(styles);
            
            var panel = self.grid.getTopPanel();
            $(panel).append(spinner.el);

            var result_info = {};
            if ( page )
                result_info.page = page;
            else if ( $('#chucho_current-page').length > 0 ) {
                result_info.page = $('#chucho_current-page').val();
            }
            else
                result_info.page = 1;

            result_info.per_page = $('#pageSelect').val();
            result_info.filter_args = get_filter_data();

            result_info.sort_columns = this.grid.getSortColumns();

            Dajaxice.chucho.read_source(
                function(resp) {
                   
                    //In case some additional data gets loaded into the response object from 
                    //outside of chucho, grab it to be sent off.
                    var cust_data = null;
                    if('cust_data' in resp)
                        cust_data = resp['cust_data'];

                    if ( 'errors' in resp ) {
                        self.error(resp.errors);
                        spinner.stop();

                        $(window).trigger('chucho-refreshed', cust_data);
                        return;
                    }
                    else {
                        spinner.stop();
                        $('#server_messages').html('');
                    }
                    
                    self.model.set_data(resp.data);
                    self.set_read_only(resp.read_only);
                    self.grid.invalidate();
                    if ( 'page_list' in resp ) {
                        $('#chucho_page_list').html(resp.page_list);
                        $('.chucho-button').button();
                        $('.chucho-button-disabled').button({disabled: true});
                    }

                    $(window).trigger('chucho-refreshed', cust_data);
                },{'app_name': self.app_name,
                   'model_name': self.model_name,
                   'get_editable': true,
                   'result_info': JSON.stringify(result_info)
                  });
        };

        /** Method to add a record */
        this.add_record = function() {
            self = this;
            //Clear row selection
            this.clear_row_selection();

            var form_id = get_grid_form(this.model_name+'_grid', this.columns, null, 'Add Record');
            if (form_id) {
                var add_callback = function() {record_callback(self.model.getLength(), false);};
                confirm_dialog(form_id, 'Add', add_callback, 'Cancel', null, true);
            }
            else
                console.log('no editable columns');
        };

        /** Method to edit a selected record in the grid. */
        this.edit_record = function() {
            var selected_index = this.grid.getSelectedRows();
            var selected_row = this.model.getItem(selected_index);

            var form_id = get_grid_form(this.model_name+'_grid', this.columns, selected_row, 'Edit Record');
            if (form_id) {
                var edit_callback = function() {record_callback(selected_index, true);};
                confirm_dialog(form_id, 'Save', edit_callback, 'Cancel', null, true);
            }
            else
                this.error('This grid is not editable.');
        };

        /** Method to add a row to the grid.
         *
         *  The row will either be added to the grid as a new row or
         *  will replace an existing row specified at the given index
         *  if updating is true.
         *
         * Keyword Args
         *    row      - Dictionary that will put into the grid as a row.
         *    index    - Row position for the row to be inserted into.
         *    updating - Boolean, row will replace the row in grid at index if true
         *               and will be inserted at index if false.
         */
        this.add_row = function(row, index, updating) {
            self = this;
          
            //Need pk if updating to know which object to update
            if(updating)
                row.pk = self.model.get_pk(index);

            self.save_row(index, row, updating);
        }; 

        /** Callback method for save_row when a server response has been recieved.
         *
         * Keyword Args
         *    i      - Index of row that was being edited
         *    update - Boolean for if we're updating a row or creating one.
         *
         * Return: Function that handles the response object from server.
         */
        this.save_callback = function(i, update) {
            self = this;

            return function(resp) {
                //Reset server message
                $('#server_messages').html('');

                if ('errors' in resp) {
                    self.error(resp.errors);
                    return;
                }
                else {
                    $('#'+self.model_name + '_add').dialog('close');
                    //Either add new row to beginning or update one.
                    if (update) {
                        self.model.setItem(i, resp.data[0]);
                        self.grid.invalidateRow(i);
                    }
                    else {
                        self.model.add_data(resp.data[0], i);
                        self.grid.invalidateAllRows();
                    }
                    
                    self.refresh(); 
                    self.grid.render();
                    self.success('Updated row ' + i);
                }
                self.clear_row_selection();
            };
        };

        /** Saves or updates a specified row at a given index
         *
         * Keyword Args
         *    i      - Index of row to be saved.
         *    row    - Dictinary containing the row data save.
         *    update - Boolean for if this is an update or a new row.
         */
        this.save_row = function(i, row, update) {
            
            Dajaxice.chucho.update(this.save_callback(i, update), {
                'app_name': this.app_name,
                'model_name': this.model_name, 
                'data': row
            });
        };
 
        /** Removes a row from the grid at a given index
         *
         *  Keyword Args
         *      index - The index to remove the row from.*/
        this.remove_row = function(index) {
            this.model.remove_data(index);
            this.grid.invalidate();
        };

        /** Deletes a selected row from the grid and removes that object from the database. */
        this.delete_row = function() {
            // get the selected row, right now assume only one.
            var selected = this.grid.getSelectedRows();
            if (selected.length != 1) {
                this.error("Error, we don't have exactly 1 data item selected!");
                return;
            }

            var row = this.model.getItem(selected[0]);

            // If there is an id, send an ajax request to delete from server, otherwise, just
            // remove it from the grid.
            if ('pk' in row) {
                self = this;
                var delete_func = function() {
                    Dajaxice.chucho.destroy(
                        function(resp) {
                            if ('errors' in resp) {
                                self.error(resp.errors);
                                return;
                            }
                            else if ('success' in resp) {
                                $('#delete_confirm').dialog('close');
                                self.remove_row(selected);
                                self.success(resp.success);
                                self.clear_row_selection();
                            }
                            else
                                self.error('Unknown error has occurred on delete.');
                        },
                        {
                            'app_name': self.app_name,
                            'model_name': self.model_name,
                            'data': self.model.getItem(selected)
                        }
                    );
                };
                confirm_dialog('delete_confirm', 'Delete', delete_func);
            }
            else {
                this.remove_row(selected);
                this.success('Locally removed row: ' + selected + '.');
            }
        };
       
        /** Shows a dialog to the user for the given error message.
         *
         * Keyword Args
         *    msg - Error message as a string.
         */
        this.error = function(msg) {
            console.log('Error: ' + msg);
            var error_div = $('#error_dialog').clone();
            $(error_div).attr('id', 'error_dialogue_message');
            var dlg_msg = $('#dialogue_message');
            if ( dlg_msg.length >= 1) {
                var msg_html = $(dlg_msg).html(error_div);
                $('#error_dialogue_message #error_msg').text(msg);
                $('#error_dialogue_message').css('display', 'inline');
                $('#dialogue_message').parent().animate({scrollTop: 0}, 'fast');
            }
            else {
                $('#error_msg').text(msg);
                confirm_dialog('error_dialog', null, null, "Ok", function() {
                    $('#error_msg').text('');
                }, false);
            }
        };

        /** Stuff to do on success. */
        this.success = function(msg) {
            console.log('Success: ' + msg);
            $('#server_messages').html(msg).css('color','green');
        };

        /** This will append a filter to the filter table.*/
        this.add_filter_row = function() {
            var row = $('<tr>');
            var remove = $('<span>');
            remove.attr('onclick', 'remove_filter_row(this);')
                .addClass('ui-icon').addClass('ui-icon-circle-close')
                .addClass('chucho-remove-button')
                .button();
            var column = $('<select name="column">');
            var operator = $('<select name="operator">');
            var comparison = $('<input type="text" name="comparison-value">');

            $(operator).append(option_element('', 'Select Operator', true));
            $(column).append(option_element('', 'Select Column', true));

            $(row).append($('<td>').append($(remove)))
                .append($('<td>').append(column))
                .append($('<td>').append(operator))
                .append($('<td>').append(comparison))
                .addClass('grid-filter')
                .appendTo($('#filter-table'));

            $.each(this.filter_operators, function(i, name) {
                var option = (option_element(name, name));
                option.appendTo($(operator));
            });
            $.each(this.filter_columns(), function(i, c) {
                var option = (option_element(c.id, c.name));
                option.appendTo($(column));
            });            
        };

        /** Here we initialize our object. */
        this.init = function() {
            this.model_name = $('#model_name').val();
            this.app_name = $('#app_name').val();
            self = this;
            Dajaxice.chucho.get_columns(
                function(resp) { 
                    self.columns = resp;

                    // Add editors to columns
                    for ( var i = 0; i < self.columns.length; i++) {
                        switch (self.columns[i]._type) {

                        case 'boolean':
                            self.columns[i].formatter = Slick.Formatters.Checkmark;
                            break;
                            
                        case 'foreignkey':
                            self.columns[i].formatter = foreign_key_formatter;
                            break;
                            
                        case 'm2m':
                            self.columns[i].formatter = m2m_formatter;
                            break;

                        case 'choice':
                            self.columns[i].formatter = choices_formatter;
                            break;

                        case 'datetime':
                        case 'timestamp':
                            self.columns[i].formatter = timestamp_formatter;
                            break;

                        case 'date':
                        case 'number':
                        case 'char':
                        case 'integer':
                        case 'text':

                        default:
                        }
                    }
                        
                    self.grid = new Slick.Grid("#" + self.model_name + "_grid", self.model,
                                               self.grid_columns(), self.options);

                    self.grid.onDblClick.subscribe(function(e, args) {
                        if(!self.read_only)
                            self.edit_record();
                    });

                    // Add controls
                    $(add_button).appendTo(self.grid.getTopPanel()); 
                    $(refresh_button).appendTo(self.grid.getTopPanel());
                    $(message_span).appendTo(self.grid.getTopPanel());
                    
                    self.grid.setSelectionModel(new Slick.RowSelectionModel());
                        
                    self.grid.onSort.subscribe(function(e, args) {
                        //var sign = args.sortAsc ? -1:1;
                        //var sorter = sorters[args.sortCol.sorter];
                        //var col = args.sortCol.field;

                        //self.model.data.sort(function(row1, row2) {
                        //    return sorter(row1, row2, sign, col);
                        //}); 
                        //self.grid.invalidate();
                        self.refresh();
                    });


                    self.grid.getSelectionModel().onSelectedRangesChanged.subscribe(function(e, args) {
                        var panel = self.grid.getTopPanel();
                        var serv_msg = $('#server_messages'); 
                        
                        //Only add these if user is allowed to edit the content
                        if(!self.read_only) {
                            //Add delete button if it's not in panel            
                            if($(panel).has('input[value="Delete"]').length <= 0)
                                $(serv_msg).before(delete_button);
                        
                            //Add edit button if it's not in panel            
                            if($(panel).has('input[value="Edit"]').length <= 0)
                                $(serv_msg).before(edit_button);
                        }

                        $(serv_msg).html('');
                    });

                    self.refresh();
                },
                {'app_name': self.app_name, 'model_name': self.model_name}
            );

            // Populate the filter options.
            Dajaxice.chucho.get_filter_operators(
                function(resp) {
                    if ('errors' in resp) {
                        self.error(resp.errors);
                        return;
                    }
                    self.filter_operators = resp;
                }
            );
        };

        this.clear_row_selection = function() {
            var panel = this.grid.getTopPanel();
            $(panel).find('input[value="Delete"]').remove(); 
            $(panel).find('input[value="Edit"]').remove(); 
            this.grid.resetActiveCell(); 
        };        

        this.init();
    }

    /** Use this function to pop up a modal dialog asking for user input.
     * Argurments action, action_func, cancel_func are optional.
     */
    function confirm_dialog(id, action, action_func, cancel, cancel_func, destroy)
    {
        if (!cancel)
            cancel = 'Cancel';

        buttons = [{
            text: cancel,
            click: function() {
                if ( cancel_func )
                    cancel_func();
                $(this).dialog('destroy');
                if(destroy)
                    $('#'+id).remove();
            }
        }];

        if ( action ) {
            buttons.push({
                text: action,
                click: function() {
                    if ( action_func )
                        action_func();
                    /*$(this).dialog('destroy');
                    if(destroy)
                        $('#'+id).remove();*/
                }
            });
        }

        $('#' + id).dialog({
            autoOpen: true,
            resizable: true,
            hide: "fade",
            show: "fade",
            modal: true,
            minWidth: 250,
            maxWidth: 1000,
            minHeight: 200,
            maxHeight: 1000,
            height: 600,
            width: 600,
            dialogClass: "confirmation dialogue",
            close: function() {
                if ( cancel_func )
                    cancel_func();
                $(this).dialog('destroy');
                if(destroy)
                    $('#' + id).remove();
            },  
            buttons: buttons
        });
    }

    // sorters = {
    //     'numeric_sorter': numeric_sorter,
    //     'alpha_sorter': alpha_sorter,
    //     'date_sorter': date_sorter,
    //     'boolean_sorter': boolean_sorter
    // }

    // /** Sorter for boolean values */
    // function boolean_sorter(row1, row2, sign, col) {
    //     var val1 = row1[col], val2 = row2[col];
    //     return (val1 && !val2 ? -1:1) * sign;
    // }

    // /** Sorter for dates*/
    // function date_sorter(row1, row2, sign, col) {
    //     var val1 = new Date(row1[col]), val2 = new Date(row2[col]);
    //     return (val1 > val2 ? -1:1) * sign;
    // }

    // /** Sorter for general alpha values (char's, text etc) */
    // function alpha_sorter(row1, row2, sign, col) {
    //     var val1 = row1[col].toLowerCase(), val2 = row2[col].toLowerCase();
    //     return (val1 > val2 ? -1:1) * sign;
    // }

    // /** Sorter for general numeric values */
    // function numeric_sorter(row1, row2, sign, col) {
    //     var val1 = row1[col], val2 = row2[col];
    //     return (val1 > val2 ? -1:1) * sign;
    // }

    /** Custom formatter for columns that have a list of choices to choose from. */
    function choices_formatter (row, cell, columnDef, dataContext) {
        var grid = myGrid.grid;
        var model = myGrid.model;
        var col = grid.getColumns()[cell].field;
        var data = model.get_cell_data(row, col);
        return data.__unicode__;
    }

    /** Custom formatter for epoch timestamp columns to display in human readable. */
    function timestamp_formatter(row, cell, columnDef, dataContext) {
     
        var data = myGrid.model.get_cell_data(row, myGrid.grid.getColumns()[cell].field);
        var time = '';
        if(data) {
            time =  new Date(data*1000);
            return dateToString(time);
        }
        
        return time
    } 

    /** Custom formatter for Foreign Key columns in the data grid */
    function foreign_key_formatter(row, cell, columnDef, dataContext) {
        var grid = myGrid.grid;
        var model = myGrid.model;
        var col = grid.getColumns()[cell].field;
        var data = model.get_cell_data(row, col);
        return data.__unicode__;
    }

    /** Custom formatter for Many to Many columns in the data grid */
    function m2m_formatter(row, cell, columnDef, dataContext) {
        var grid = myGrid.grid;
        var model = myGrid.model;
        var col = grid.getColumns()[cell].field;
        var data = model.get_cell_data(row, col);
        
        var m_input = ""; 
        if(data.length > 0) {
            //Create div used for dialog when viewing m2m data
            var div = "<div id='m2m_"+row+"_"+cell+"' style='display:none'>";
            
            var ul = "<ul>";
            for (var i = 0; i < data.length; i++) {
                var li = "<li>"+data[i].__unicode__+"</li>";
                ul += li;
            }
            ul += "</ul>";
            div += ul + "</div>"; 
            
            //Make button that triggers dialog
            var onclick = "confirm_dialog('m2m_" + row + "_" + cell + "', null, null, 'Ok');";
            m_input = '<span onclick="' + onclick + '" class="chucho-clickable">View</span>' + div;
        }

        return m_input;
    }

    /** Creates a hidden div structure filled with various input fields to be shown by a dialog.
     * 
     *  The divs inputs are determined by the columns that are passed in.  These columns should be
     *  the chuchos current columns so that the div can be built dynamically.
     *
     *  Keyword Args
     *      id      - The id of the dom element to append the div after.
     *      columns - The DataGrids columns object.
     *      record  - Dict containing data that will be pre-inserted into the input fields.
     *      title   - String to put into the title bar of dialog when created.
     *
     *  Return: Div id or null if no columns are editable.
     * */
    function get_grid_form(id, columns, record, title) 
    {
        var div_id = myGrid.model_name+"_add";
        var div = $("<div></div>")
            .attr("id", myGrid.model_name+'_add')
            .attr('title', title);
        var table = $("<table></table>");

        var msg_div = $('<div></div>').attr('id',  'dialogue_message');
        $(div).append(msg_div);
       
        $('#'+id).append(div);
        div.append(table);

        //If we cycle through all columns and none are editable we'll return null
        var model_editable = false;
        $.each(columns, function(i, col) {
            
            //continue if can't edit this one
            //if (!col._editable)
            //   return true;
                
            model_editable = true;     
   
            //Set up html containers for the input
            var tr = $("<tr></tr>");
            table.append(tr);
            td1 = $("<td></td>");
            td2 = $("<td></td>");
            
            tr.append(td1);
            tr.append(td2);

            var span = $("<span></span>")
                .attr('class', 'field')
                .css('display', 'none')
                .text(col.field);

            var label = $("<span></span>").text(col.name);
            var input = null;
            var value = "";

            //If updateing then we'll set the field with the current value
            if (record)
                value = record[col.field];
             
            switch(col._type) {
            case 'auth_password':
                input = get_input('add_form_input', 'text', '');
                td1.append(label);
                td2.append(input);
                break;

            case 'integer':
                if(col._editable) {
                    input = get_input('add_form_input', 'text', value); 
                    td2.append(input);
                    //$(input).spinner();
                }
                else {
                    input = $("<span></span>").append(value);
                    td2.append(input);
                }
                td1.append(label);
                break;

            case 'decimal':
                input = get_input('add_form_input', 'text', value); 
                td2.append(input);
                td1.append(label);
                $(input).spinner();
                break;

            case 'foreignkey': 
                input = get_pk_input('add_form_input foreignkey', value, col.model_name, col.app); 
                td2.append(input);
                td1.append(label);
                break;
                
            case 'm2m':
                input = get_m2m_input('add_form_input m2m', value, col.model_name, col.app); 
                td2.append(input);
                td1.append(label);
                break;

            case 'boolean':
                input = get_input('add_form_input', 'checkbox', '');
                if(value)
                    input.attr('checked', 'checked');
                td2.append(input);
                td1.append(label);
                break;

            case 'date':
                input = get_input('add_form_input', 'text', value);
                td2.append(input);
                td1.append(label);

                $(input).datepicker({
                    dateFormat: 'mm/dd/yy'
                });
                $(input).datepicker('setDate', value); 
                break;
 
            case 'datetime':
            case 'timestamp':
                var timestamp = new Date(value*1000);
                if(col._editable) {
                    input_user = get_input('', 'text', '');
                    
                    if(!isNaN(timestamp.valueOf()))
                        input = get_input('add_form_input', 'hidden', timestamp.valueOf()/1000);
                    else
                        input = get_input('add_form_input', 'hidden', '');
                    $(input_user).attr('onchange', 'updateTimestampInput(this);');
                    td2.append(input_user);
                    td2.append(input);
                    
                    $(input_user).datetimepicker({
                        showSecond: true,
                        dateFormat: 'mm/dd/yy',
                        timeFormat: 'hh:mm:ss'
                    });
                    $(input_user).datetimepicker('setDate', timestamp);
                }
                else {
                    if(!isNaN(timestamp.valueOf()))
                        input = $('<span>').text(dateToString(timestamp));
                    else
                        input = $('<span>').text('');
                    td2.append(input);
                }
                td1.append(label);
                break;
                
            case 'color':
                input = get_input('add_form_input', 'text', value);
                td2.append(input);
                td1.append(label);
                $(input).minicolors({
                    control: 'wheel',
                    defaultValue: value,
                    position: 'top',
                    theme: 'none'     
                });
                break;

            case 'choice':
                input = get_choices_input('add_form_input', value, col.choices);
                td2.append(input);
                td1.append(label);
                break;

            default:
                if(col._editable) {
                    input = get_input('add_form_input', 'text', value);
                }
                else {
                    input = $("<span></span>").append(value);
                }
                td2.append(input);
                td1.append(label);
            }

            input.before(span);
        });
 
        if (!model_editable)
            return null;
        return div_id;
    }

    /** Creates and returns a basic input field.
     *
     * Keyword Args
     *    cls   - The class to give the input field.
     *    type  - The type of input to create.
     *    value - The value to give to the input field to start with if any.
     *
     * Return: The newly created input field 
     */
    function get_input(cls, type, value) 
    {
        var input = $("<input/>").val(value)
                                 .attr({ 
                                     'class': cls,
                                     'type' : type 
                                 });

        return input;
    }

    /** Creates and returns a basic select input field.
     *
     * This will preload the select field with results from the data stored in a choices column. 
     *
     * Keyword Args
     *    cls     - The class to give the input field.
     *    choices - The list of objects that will be put into the select field.
     *    value   - The value to give to the input field to start with if any.
     *
     * Return: The newly created select field
     */
    function get_choices_input (cls, value, choices) 
    {
        var input = $("<select></select>").attr({'class': cls});
       
        $(choices).each(function(i, c) {
            var option = $("<option></option>")
                .attr('value', (c.value))
                .text(c.__unicode__);
           
            if(value !== '' && value.value == c.value) 
                option.attr('selected', 'selected');
            input.append(option);
        });

        return input;
    }

    /** Creates and returns a basic select input field.
     *
     * This will preload the select field with results from the server. The preloaded objs
     * will be fetched from the given model name.
     *
     * Keyword Args
     *    cls        - The class to give the input field.
     *    value      - The value to give to the input field to start with if any.
     *    model_name - The model name to fetch the objects from for the select field.
     *
     * Return: The newly created select field
     */
    function get_pk_input (cls, value, model_name, app_name) 
    {
        var input = $("<select></select>").attr({'class': cls});
       
        //Get all objects that the user can select from
        Dajaxice.chucho.read_source( function(resp) {

            $(resp.data).each(function(i, obj) {
                var option = $("<option></option>")
                    .attr('class', obj.pk)
                    .text(obj.__unicode__);

                if(value !== '' && obj.pk == value.pk) 
                    option.attr('selected', 'selected');
                input.append(option);

            });
        }, 
        {'app_name': app_name, 'model_name': model_name, 'get_editable': false});

        return input;
    }

    /** Creates and returns a basic select multiple input field.
     *
     * This will preload the select field with results from the server. The preloaded objs
     * will be fetched from the given model name.
     *
     * Keyword Args
     *    cls        - The class to give the input field.
     *    value      - The value to give to the input field to start with if any.
     *    model_name - The model name to fetch the objects from for the select field.
     *
     * Return: The newly created select multiple field
     */
    function get_m2m_input (cls, value, model_name, app_name) 
    {
        var div = $('<div></div>').attr({'class': cls});
        var ul = $('<ul></ul>').css('list-style', 'none');                   
        div.append(ul);

        //Get all objects that the user can select from
        Dajaxice.chucho.read_source( function(resp) {

            $(resp.data).each(function(i, obj) { 
                
                var li = $('<li></li>');
                var checkbox = get_input('', 'checkbox', obj.pk);
                var label = $('<label></label>').text(obj.__unicode__);

                 //Pre-select appropriate objects
                $(value).each(function(i, val) {
                    if(val !== '' && obj.pk == val.pk) 
                        checkbox.attr('checked', 'checked');
                });

                ul.append(li);
                li.append(checkbox);
                checkbox.after(label);
            });
        }, {'app_name': app_name, 'model_name': model_name, 'get_editable': false});

        return div;
    }

    /** Callback method for when a user adds or updates a record
     *
     * Keyword Args
     *    index    - The index where the record will be added/edited.
     *    updating - Boolean, true if updating a record and false if adding one.
     */
    function record_callback(index, updating) 
    {
        var row = {};
        $('.add_form_input').each(function(i, input) {

            var field = $(input).prev('span.field').text();
            row[field] = field_value(input);      
        });
        myGrid.add_row(row, index, updating);
    }

    /** Get's a field input from the add/edit dialog and returns it's value.
     *
     * Keyword Args
     *    input - Html input that contains the desired value.
     *
     * Return: Value of input field
     */
    function field_value (input) 
    {
        if($(input).hasClass('foreignkey')) {
            return {'pk': $(':selected', input).attr('class')};
        }
        else if($(input).hasClass('m2m')) {
            var array = [];
            $(':checked', input).each(function(i, sel) {
                array.push({'pk': $(sel).val()});
            });
            return array;
        }
        else if($(input).hasClass('ui-spinner-input'))
            return $(input).spinner('value');
        else if($(input).attr('type') == "checkbox")
            return $(input).attr('checked') ? true:false; 
        else
            return $(input).val();
    }

    
    /** Creates and returns a spinner object.  
     *
     *  Spinner options can be specified by providing a Object with Spinner options.
     *  If provided these options will completly override the default ones given.
     *
     * Keyword Args
     *     opts - Optional Object containing user specified spinner options
     *
     * Return: Initialized Spinner object.
     */
    function get_spinner (opts) 
    {
        var default_opts = { 
            lines: 11,            // The number of lines to draw
            length: 8,           // The length of each line
            width: 2,            // The line thickness
            radius: 3,           // The radius of the inner circle
            corners: 1,           // Corner roundness (0..1)
            rotate: 0,            // The rotation offset
            direction: 1,         // 1: clockwise, -1: counterclockwise
            color: '#000',        // #rgb or #rrggbb
            speed: 1,             // Rounds per second
            trail: 44,            // Afterglow percentage
            shadow: false,        // Whether to render a shadow
            hwaccel: false,       // Whether to use hardware acceleration
            className: 'spinner', // The CSS class to assign to the spinner
            zIndex: 2e9,          // The z-index (defaults to 2000000000)
            top: 'auto',          // Top position relative to parent in px
            left: 'auto'          // Left position relative to parent in px
        };  

        //Use defaults if none were given to us.
        if(!opts)
            opts = default_opts;
                                                                                                                                           
        return new Spinner(opts);
    } 

    function get_filter_data() {
        var filter_data = [];
        var filters = $('.grid-filter');
        $(filters).each(function(i, e) {
            var temp_obj = {};

            var temp = $(e).find('select[name="column"]').val();
            if ( !temp )
                return;
            temp_obj.col = temp;

            temp = $(e).find('select[name="operator"]').val();
            if ( !temp )
                return;
            temp_obj.oper = temp;

            temp = $(e).find('input[name="comparison-value"]').val();
            if ( !temp )
                temp = '';
            temp_obj.val = temp;

            filter_data.push(temp_obj);
        });
        return filter_data;
    }

    /** This will remove a filter from the filter table */
    function remove_filter_row(e) {
        $(e).parent().parent().remove();
        myGrid.refresh();
    }

    /** Take a Date object and return a string formatted as:
     * mm/dd/yyyy HH:MM:SS
     */
    function dateToString(date)
    {
        dStr = String(date.getMonth() + 1) + '/' + String(date.getDate()) + '/' + String(date.getFullYear());
        dStr += ' ' + String(date.getHours()) + ':' + String(date.getMinutes()) + ':';
        if (date.getSeconds() < 10)
            dStr += '0';
        dStr += String(date.getSeconds());
        return dStr;
    }

    function updateTimestampInput(e) {
        var d = new Date($(e).val());
        var value = null;
        if(!isNaN(d.valueOf()))
            value = d.valueOf()/1000;
         $(e).nextAll('.add_form_input').val(value);
    }

    $.extend(window, {
        'DataGrid': DataGrid,
        'confirm_dialog': confirm_dialog,
        'remove_filter_row': remove_filter_row,
        'updateTimestampInput': updateTimestampInput
    });
})(jQuery);
