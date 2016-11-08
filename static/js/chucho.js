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

//This is to use AMD if we are running require.js
(function (factory){
(function(window,document,navigator,$,ko,Spinner,undefined){
!function(factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports', 'jquery', 'knockout', 'spin.min', 'chucho.grid'], factory);
    }
    else {
        factory(window['DataGrid'] = {},$,ko,Spinner);
    }
}(function(exports,$,ko,Spinner) {

    /* Extra html for grids  */
    var addButton = '<input type="button" class="btn btn-primary btn-sm chucho-add" value="Add"></input>';
    var deleteButton = '<input type="button" class="btn btn-primary btn-sm chucho-delete" value="Delete"/>';
    var editButton = '<input type="button" class="btn btn-primary btn-sm chucho-edit" value="Edit"/>';
    var refreshButton = '<input type="button" class="btn btn-primary btn-sm chucho-refresh" value="Refresh"/>';
    var messageSpan = '<span id="server_messages" style="padding-left:1em"></span>';

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
        /** This is the name of the django model to we are creating the grid for. */
        this.modelName = '';

        /** This is the name of the django app that knows about the model */
        this.appName = '';

        /** The column definition for the grid.  This is loaded via ajax. */
        this.columns = null;

        /** Holds an instance of the ko grid */
        this.grid = null;


        /** Returns the button panel div element for the grid */
        this.getBtnPanel = function() {
            return $('#'+this.modelName+'_grid div.btnPanel');
        };


        /** Returns the grid container div element */
        this.getGridContainer = function() {
            return $('#'+this.modelName+'_grid div.gridContainer');
        };


        /** Returns the table element for the grid */
        this.getTable = function() {
            return $('#'+this.modelName+'_grid table.chucho-grid');
        };


        /** Returns the index of the currently selected row in the grid */
        this.getSelectedRow = function() {
            var selectedRow = $('#'+this.modelName+'_grid table.chucho-grid tr.selected');
            if (selectedRow.length != 1) {
                this.error("Error, we don't have exactly 1 data item selected!");
                return null;
            }
            return $($(selectedRow).get(0)).data('row');
        };


        /** Returns a dictionary containing the current column that is sorted or to be sorted and null otherwise */
        this.getSortColumns = function() {
            var sortedCol = this.grid.sortedCol();
            if (sortedCol['column'] === null || sortedCol['asc'] === null)
                return null;

            return {'columnId': sortedCol['column'], 'sortAsc': sortedCol['asc']};
        };

        /** Gets cookie so that we may get csrf token from it */
        this.getCookie = function(name) {
            var cookieValue = null;
            if (document.cookie && document.cookie != '') {
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var cookie = jQuery.trim(cookies[i]);
                    // Does this cookie string begin with the name we want?
                    if (cookie.substring(0, name.length + 1) == (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }

        /** deselects any selected rows in the table and removes buttons from panel that appear when
         *  any row selection occurs. */
        this.clearRowSelection = function() {
            var panel = this.getBtnPanel();
            (panel).find('input[value="Delete"]').remove();
            $(panel).find('input[value="Edit"]').remove();
            $(this.getTable()).find('tr.selected').removeClass('selected');
        };


        /** Return the columns to be displayed by the grid */
        this.grid_columns = function() {
            var columns = $.map(this.columns, function(c, i) {
                if ( c.grid_column)
                    return c;
                else
                    return undefined;
            });
            return columns;
        };


        /** Return the column object by the given column id */
        this.get_column_by_id = function(id) {
            var result = $.grep(this.columns, function(e, i) {
                if ( e.id == id )
                    return true;
                return false;
            });
            if (result.length === 0)
                return null;
            else if ( result.length > 1)
                throw new Error('Found more than 1 column with the same id.');
            return result[0];
        };


        /** Return the columns allowed to filter by. */
        this.filter_columns = function() {
            var columns = $.map(this.columns, function(c, i) {
                if (c.hasOwnProperty('filter_column') === false)
                    return undefined;

                return c;
            });
            return columns;
        };

        /** The columns and operators that we can filter over for this grid. */
        this.filter_operators = null;

        this.setReadOnly = function(readOnly) {
            this.grid.readOnly = readOnly;
            var panel = this.getBtnPanel();

            var add = $(panel).children('input[value="Add"]');
            if(this.grid.readOnly) {
                if($(add).length > 0)
                    $(add).remove();
            }
            else {
                if($(add).length <= 0)
                    $(addButton).prependTo(panel);
            }
        };


        /** Method to get data from server and refresh the grid.*/
        this.refresh = function(page) {
            self = this;
            this.clearRowSelection();

            var spinner = get_spinner();
            spinner.spin();
            var styles = {
                'display': 'inline',
                'bottom':  '6px'
            };
            $(spinner.el).css(styles);

            var panel = self.getBtnPanel();
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
            result_info.sort_columns = this.getSortColumns();
            get_editable = true

            $.get( '/chucho/'+self.appName+'/'+self.modelName+'/'
                  ,{'jsonData': JSON.stringify({'get_editable': get_editable, 'result_info': result_info})}
                  ,function(resp) {

                    spinner.stop();
                    //In case some additional data gets loaded into the response object from
                    //outside of chucho, grab it to be sent off.
                    var cust_data = null;
                    if('cust_data' in resp)
                        cust_data = resp.cust_data;

                    if ( 'errors' in resp ) {
                        self.error(resp.errors);
                        $(window).trigger('chucho-refreshed', cust_data);
                        return;
                    }
                    else {
                        $('#server_messages').html('');
                    }

                    self.grid.items(resp.data)
                    self.setReadOnly(resp.read_only);
                    if ( 'page_list' in resp ) {
                        $('#chucho_page_list').html(resp.page_list);
                        $('.chucho-button').button();
                        $('.chucho-button-disabled').button({disabled: true});
                    }

                    $(window).trigger('chucho-refreshed', cust_data);
            })
            .fail(function() {
                    spinner.stop();
                    self.error("Something unexpected occured!");
                    return;
            });
        };


        /** Method to add a record */
        this.addRecord = function() {
            self = this;

            var form_id = get_grid_form(this.modelName+'_grid', this.columns, null, 'Add Record');
            if (form_id) {
                var add_callback = function() {record_callback(null, false);};
                confirm_dialog(form_id, 'Add', add_callback, 'Cancel', null, true);
            }
            else
                console.log('no editable columns');
        };


        /** Method to edit a selected record in the grid. */
        this.editRecord = function(selected_index) {
            var selected_row = this.grid.getRow(selected_index);

            var form_id = get_grid_form(this.modelName+'_grid', this.columns, selected_row, 'Edit Record');
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
                row.pk = self.grid.getPk(index);

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
                    $('#'+self.modelName + '_add').dialog('close');
                    //Either add new row to beginning or update one.
                    if (update)
                        self.grid.setRow(i, resp.data[0]);
                    else
                        self.grid.addRow(resp.data[0]);

                    self.refresh();
                    self.success('Updated row ' + i);
                }
                self.clearRowSelection();
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
            var csrftoken = this.getCookie('csrftoken');
            var url = '/chucho/'+this.appName+'/'+this.modelName+'/';
            var type = 'POST';

            if(row.hasOwnProperty('pk')) {
                url += row['pk']+'/';
                type = 'PUT';
            }

            $.ajax({
                 url: url
                ,beforeSend: function(xhr) {
                    xhr.setRequestHeader("X-CSRFToken", csrftoken);
                 }
                ,type: type
                ,contentType: 'application/json'
                ,processData: false
                ,data: JSON.stringify(row)
                ,success: this.save_callback(i, update)
            });
        }


        /** Deletes a selected row from the grid and removes that object from the database. */
        this.deleteRow = function() {
            // get the selected row, right now assume only one.
            var selected = this.getSelectedRow();
            if (selected === null)
                return;

            var row = this.grid.getRow(selected);

            // If there is an id, send an ajax request to delete from server, otherwise, just
            // remove it from the grid.
            if ('pk' in row) {
                self = this;
                var delete_func = function() {

                    var csrftoken = self.getCookie('csrftoken');
                    $.ajax({
                         url: '/chucho/'+self.appName+'/'+self.modelName+'/'+row['pk']+'/'
                        ,beforeSend: function(xhr) {
                            xhr.setRequestHeader("X-CSRFToken", csrftoken);
                         }
                        ,type: 'DELETE'
                        ,success: function(resp) {

                            if ('errors' in resp) {
                                self.error(resp.errors);
                                return;
                            }
                            else if ('success' in resp) {
                                $('#delete_confirm').dialog('close');
                                self.grid.removeRowAtIndex(selected);
                                self.success(resp.success);
                                self.clearRowSelection();
                            }
                            else
                                self.error('Unknown error has occurred on delete.');
                        }
                    });
                };
                confirm_dialog('delete_confirm', 'Delete', delete_func);
            }
            else {
                this.grid.removeRowAtIndex(selected);
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


        this.toTitleCase = function(str) {
            return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
        };

        /** Stuff to do on success. */
        this.success = function(msg) {
            console.log('Success: ' + msg);
            $('#server_messages').html(msg).css('color','green');
        };


        /** This will append a filter to the filter table.*/
        this.add_filter_row = function() {
            var row = $('<div class="row">');
            var remove = $('<span>');
            var self = this;
            remove.attr('onclick', 'remove_filter_row(this);')
                  .addClass('glyphicon').addClass('glyphicon-minus')
                  .addClass('chucho-remove-button')
                  .button();

            var column = $('<select>', {name: 'column'})
                .change(function(event) {

                    //If user selectes 'Select Column' options remove all related select fields that come
                    //after this one and quite early.
                    if($(event.target).val() === '') {
                        $(event.target).nextAll('select.grid-filter-columns').remove();
                        $(event.target).parent('div').siblings('div.operator-td').remove();
                        $(event.target).parent('div').siblings('div.comparison-td').remove();

                        return;
                    }

                    $(event.target).find(':selected').trigger('select');
                    //self.add_filter_row_options(event)
                })
                .addClass('grid-filter-columns')
                .append(option_element('', 'Select '+self.toTitleCase(self.modelName)+' Column', true));

            $(row).append($('<div class="col-md-3">').append($(remove))
                  .append(column))
                  .addClass('grid-filter')
                  .appendTo($('#filter-table'));


            $.each(this.filter_columns(), function(i, c) {
                var option = (option_element(c.id, c.name));
                var filter_column = c.filter_column;

                $(option).on('select', function(event) {
                    if(filter_column.related.length > 0) {
                        $(event.target).parent('select').parent('div').siblings('div.operator-td').remove();
                        $(event.target).parent('select').parent('div').siblings('div.comparison-td').remove();
                        self.add_related_options(filter_column.related, event.target);
                    }
                    else {
                        $(event.target).parent('select').nextAll('select.grid-filter-columns').remove();
                        self.add_filter_row_options(event, self, c);
                    }
                });
                option.appendTo($(column));
            });
        };


        this.add_related_options = function(newOptions, selectedOption) {
            var self = this;

            var column = $('<select>', {name: 'column'})
                .change({self: self}, function(event) {

                    //If user selectes 'Select Column' options remove all related select fields that come
                    //after this one and quite early.
                    if($(event.target).val() === '') {
                        $(event.target).nextAll('select.grid-filter-columns').remove();
                        $(event.target).parent('div').siblings('div.operator-td').remove();
                        $(event.target).parent('div').siblings('div.comparison-td').remove();
                        return;
                    }

                    $(event.target).find(':selected').trigger('select');
                })
                .addClass('grid-filter-columns')
                .append(option_element('', 'Select '+self.toTitleCase($(selectedOption).val())+' Column', true));

            $.each(newOptions, function(i, c) {
                var option = (option_element(c.id, c.name));
                var related_columns = [];
                if(c.hasOwnProperty('filter_column') === true)
                    var related_columns = c.filter_column.related;

                $(option).on('select', function(event) {
                    if(related_columns.length > 0) {
                        self.add_related_options(related_columns, event.target);
                        $(event.target).parent('select').parent('div').siblings('div.operator-td').remove();
                        $(event.target).parent('select').parent('div').siblings('div.comparison-td').remove();
                    }
                    else {
                        $(event.target).parent('select').nextAll('select.grid-filter-columns').remove();
                        self.add_filter_row_options(event, self, c);
                    }
                });
                option.appendTo($(column));
            });

            var parentSelect = $(selectedOption).parent('select');
            $(parentSelect).after(column);
        };

        /** This will append the operators and input box to the filter table */
        this.add_filter_row_options = function(event, context, col_data) {
            var row = $(event.target).parents('div.grid-filter');
            var operator = $('<select>', {name:'operator'});
            var comparison;
            var col_name = $(event.target).val();

            row.find('select[name="operator"]').parent().remove();
            row.find('input[name="comparison-value"]').parent().remove();

            row.append($('<div class="col-md-3">').addClass('operator-td').append(operator));

            if (col_data._type == 'timestamp') {
                comparison = $('<input>', {type:'hidden', name:'comparison-value'});
                var picker = $('<input>', {type:'text', name:'comparison-picker'});
                var td = $('<div>').addClass('comparison-td');
                td.append(picker);
                td.append(comparison);
                row.append(td);
                picker.change(function(event) {
                    var d = new Date($(event.target).val());
                    var value_e = null;
                    if (!isNaN(d.valueOf()))
                        value = d.valueOf()/1000;
                    $(event.target).next().val(value);
                });
                $(picker).datetimepicker({
                    showSecond: true,
                    dateFormat: 'mm/dd/yy',
                    timeFormat: 'hh:mm:ss'
                });
            }
            else {
                comparison = $('<input>', {type:'text', name:'comparison-value'});
                row.append($('<div>').addClass('col-md-3 comparison-td').append(comparison));
                console.log("there");
            }
            console.log("here")

            $(operator).append(option_element('', 'Select Operator', true));

            $.each(context.filter_operators, function(i, name) {
                var option = (option_element(name, name));
                option.appendTo($(operator));
            });
        };


        /** Custom formatter for Foreign Key columns in the data grid */
        function foreignKeyFormatter(row, col, rowIndex, colIndex) {
            return row[col].__unicode__;
        }


        /** Custom formatter for Many to Many columns in the data grid */
        function m2mFormatter(row, col, rowIndex, colIndex) {
            var data = row[col];

            var m_input = "";
            if(data.length > 0) {
                //Create div used for dialog when viewing m2m data
                var div = "<div id='m2m_"+rowIndex+"_"+colIndex+"' style='display:none'>";

                var ul = "<ul>";
                for (var i = 0; i < data.length; i++) {
                    var li = "<li>"+data[i].__unicode__+"</li>";
                    ul += li;
                }
                ul += "</ul>";
                div += ul + "</div>";

                //Make button that triggers dialog
                var onclick = "confirm_dialog('m2m_" + rowIndex + "_" + colIndex + "', null, null, 'Ok');";
                m_input = '<span onclick="' + onclick + '" class="chucho-clickable">View</span>' + div;
            }

            return m_input;
        }


        /** Custom formatter for columns that have a list of choices to choose from. */
        function choicesFormatter (row, col, rowIndex, colIndex) {
            return row[col].__unicode__;
        }


        /** Custom formatter for epoch timestamp columns to display in human readable. */
        function timestampFormatter(row, col, rowIndex, colIndex) {
            var data = row[col];
            var time = '';
            if(data) {
                time =  new Date(data*1000);
                return dateToString(time);
            }

            return time;
        }


        function colorFormatter(row, col, rowIndex, colIndex) {
            var data = row[col];
            return '<span class="badge" style="background-color: '+data+'">&nbsp;</span>';
        };

        /** Custom formatter for boolean columns in the data grid */
        function booleanFormatter(row, col, rowIndex, colIndex) {
            if (row[col] === true)
                return '<span class="glyphicon glyphicon-ok"></span>';
            else if(row[col] === false)
                return '<span class="glyphicon glyphicon-remove"></span>';
            else
                return '<span class="glyphicon glyphicon-question-sign"></span>';
        }


        /** Here we initialize our object. */
        this.init = function() {
            this.modelName = $('#model_name').val();
            this.appName = $('#app_name').val();
            self = this;

            $.ajax({
                 url: '/chucho/columns/'+self.appName+'/'+self.modelName+'/'
                ,type: 'GET'
                ,success: function(resp) {
                    self.columns = resp;

                    // Add editors to columns
                    for ( var i = 0; i < self.columns.length; i++) {
                        switch (self.columns[i]._type) {

                        case 'boolean':
                            self.columns[i].formatter = booleanFormatter;
                            break;

                        case 'foreignkey':
                            self.columns[i].formatter = foreignKeyFormatter;
                            break;

                        case 'm2m':
                            self.columns[i].formatter = m2mFormatter;
                            break;

                        case 'choice':
                            self.columns[i].formatter = choicesFormatter;
                            break;

                        case 'datetime':
                        case 'timestamp':
                            self.columns[i].formatter = timestampFormatter;
                            break;

                        case 'color':
                            self.columns[i].formatter = colorFormatter;

                        case 'date':
                        case 'number':
                        case 'char':
                        case 'integer':
                        case 'text':

                        default:
                        }
                    }

                    this.PagedGridModel = function(items, columns) {
                        this.items = ko.observableArray(items);

                        /** Determines whether or not we want to allow the user to only view data or edit it. */
                        this.readOnly = true;

                        this.getRow = function(i) {
                            return this.items()[i];
                        };

                        this.setSortedCol = function(colId, asc) {
                            this.sortedCol({
                                'column': colId,
                                'asc': asc
                            });
                        };

                        this.setRow = function(i, item) {
                            this.items.splice(i, 1, item);
                        };

                        this.addRow = function(item) {
                            this.items.unshift(item);
                        };

                        this.removeRowAtIndex = function(i) {
                            this.items.splice(i, 1);
                        };

                        this.getPk = function(i) {
                            return this.items()[i].pk;
                        };

                        this.getColumns = function() {
                            return this.gridViewModel.columns;
                        };

                        this.getColumnId = function(text) {
                            var colId = null;
                            $.each(this.getColumns(), function(i, col) {
                                if (col['name'] === text) {
                                    colId = col['id'];
                                    return;
                                }
                            });
                            return colId;
                        };

                        this.sortedCol = ko.observable({
                            'column': null,
                            'asc': null
                        });

                        this.gridViewModel = new ko.chuchoGrid.viewModel({
                            data: this.items,
                            columns: columns,
                            sortedCol: this.sortedCol
                        });
                    }; // End PagedGridModel

                    var gridCols = self.grid_columns();
                    self.grid = new this.PagedGridModel([], gridCols);

                    //Handle single and double clicks for rows
                    ko.bindingHandlers.clickHandler = {
                        init: function(element, valueAccessor) {
                            var delay = 200,
                                clickTimeout = false;

                            $(element).click(function() {
                                //Double click
                                if(clickTimeout !== false) {
                                    $('#'+self.modelName+'_grid table.chucho-grid tr.selected').removeClass('selected');
                                    $(element).addClass('selected');

                                    if(!self.grid.readOnly) {
                                        var value = valueAccessor();
                                        self.editRecord(value);
                                    }
                                    clearTimeout(clickTimeout);
                                    clickTimeout = false;

                                    $(self).trigger('rowSelectionChange');
                                }
                                //Single click
                                else {
                                    clickTimeout = setTimeout(function() {
                                        $('#'+self.modelName+'_grid table.chucho-grid tr.selected').removeClass('selected');
                                        $(element).addClass('selected');
                                        clickTimeout = false;

                                        $(self).trigger('rowSelectionChange');
                                    }, delay);
                                }
                            });
                        }
                    };

                    //Handle clicks to column headers and determine if it can be sorted or not.
                    ko.bindingHandlers.sortHandler = {
                        init: function(element, valueAccessor) {

                            $(element).click(function() {
                                var colData = valueAccessor();
                                if (colData.hasOwnProperty('sortable') === false || colData['sortable'] === false)
                                    return;

                                var currentSorted = self.grid.sortedCol();
                                if (currentSorted['column'] === null ||
                                    currentSorted['column'] !== colData['id'] ||
                                    currentSorted['asc'] === true)
                                    self.grid.setSortedCol(colData['id'], false);
                                else if (currentSorted['asc'] === false)
                                    self.grid.setSortedCol(colData['id'], true);
                                else {
                                    console.error('Un unexpected sorting condition occured!'+
                                                  'Col: '+currentSorted['column']+'  Asc: '+currentSorted['asc']);
                                    return;
                                }
                                self.refresh();
                            });
                        }
                    };

                    ko.applyBindings(self.grid, $('#'+self.modelName+'_grid div.gridContainer')[0]);

                    $(addButton).appendTo(self.getBtnPanel());
                    $(refreshButton).appendTo(self.getBtnPanel());
                    $(messageSpan).appendTo(self.getBtnPanel());


                    $(self).on('rowSelectionChange', function() {
                        var panel = self.getBtnPanel();
                        var serv_msg = $('#server_messages');
                        //Only add these if user is allowed to edit the content
                        if(!self.grid.readOnly) {
                            //Add delete button if it's not in panel
                            if($(panel).has('input[value="Delete"]').length <= 0)
                                $(serv_msg).before(deleteButton);

                            //Add edit button if it's not in panel
                            if($(panel).has('input[value="Edit"]').length <= 0)
                                $(serv_msg).before(editButton);
                        }

                        $(serv_msg).html('');
                    });

                    //Attach all needed event handlers to buttons and the like
                    $(self.getBtnPanel()).on('click', 'input.chucho-edit', function() {
                        var selectedRow = self.getSelectedRow();
                        if (selectedRow === null)
                            return;

                        self.editRecord(selectedRow);
                    });

                    $(self.getBtnPanel()).on('click', 'input.chucho-add', function() {
                        self.addRecord();
                    });

                    $(self.getBtnPanel()).on('click', 'input.chucho-delete', function() {
                        self.deleteRow();
                    });

                    $(self.getBtnPanel()).on('click', 'input.chucho-refresh', function() {
                        self.refresh();
                    });

                    //Refresh will get the first wave of data
                    self.refresh();
                } // End Success Callback
            });

            $.ajax({
                 url: '/chucho/filters/'
                ,type: 'GET'
                ,success: function(resp) {
                    if ('errors' in resp) {
                        self.error(resp.errors);
                        return;
                    }
                    self.filter_operators = resp;
                }
            });

        }; // End init

        this.init();
    } // End DataGrid


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
                if ( cancel_func ){
                    cancel_func();
                }
                $(this).dialog('destroy');
                if(destroy)
                    $('#'+id).remove();
            },
            myFunction: function(){
                $('#myModal').modal('toggle');
            }
        }];

        if ( action ) {
            buttons.push({
                text: action,
                click: function() {
                    if ( action_func )
                        action_func();
                },
                myFunction: action_func
            });
        }

        var div = $("<div></div>");
        console.log(action_func);
        for(var i in buttons){
            console.log(buttons[i]);
            div.append('<button type="button" class="btn btn-defualt" onclick="' + buttons[i].myFunction + '">' + buttons[i].text + '</button>');
        }
        $('#modal-footer').empty();
        $('#modal-footer').append(div);
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
        $('#myModal').modal('toggle');
        var div_id = myGrid.modelName+"_add";
        var div = $("<div></div>")
                   .attr("id", myGrid.modelName+'_add')
                   .attr('title', title);

        var table = $("<table class='table'></table>");

        var msg_div = $('<div></div>').attr('id',  'dialogue_message');
        $(div).append(msg_div);

        $('#modal-body').append(div);
        div.append(table);

        //If we cycle through all columns and none are editable we'll return null
        var model_editable = false;
        $.each(columns, function(i, col) {

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
                case 'password':
                    if(col._editable)
                        input = get_input('add_form_input', 'text', '');
                    else
                        input = $("<span>***************</span>");

                    td1.append(label);
                    td2.append(input);
                    break;

                case 'integer':
                    if(col._editable)
                        input = get_input('add_form_input', 'text', value);
                    else {
                        input = $("<span></span>").append(value);
                        if(value === '' || value === null)
                            input = $("<span><i>None</i></span>");
                    }
                    td2.append(input);
                    td1.append(label);
                    break;

                case 'decimal':
                    if(col._editable) {
                        input = get_input('add_form_input', 'text', value);
                        td2.append(input);
                        // $(input).spinner();
                    }
                    else {
                        input = $("<span></span>").append(value);
                        if(value === "" || value === null)
                            input = $("<span></span>").append('<i>None</i>');

                        td2.append(input);
                    }

                    td1.append(label);
                    break;

                case 'foreignkey':
                    if(col._editable)
                        input = get_pk_input('add_form_input foreignkey', value, col);
                    else {
                        input = $("<span></span>").append(value.__unicode__);
                        if(value.__unicode__ === '')
                            input = $("<span></span>").append('<i>None</i>');
                    }

                    td2.append(input);
                    td1.append(label);
                    break;

                case 'm2m':
                    if(col._editable)
                        input = get_m2m_input('add_form_input m2m', value, col.model_name, col.app);
                    else {
                        if(value.length > 0) {
                            input = $('<ul></ul>');
                            $(value).each(function(i, val) {
                                var li = $('<li></li>').append(val.__unicode__)
                                $(input).append(li);
                            });
                        }
                        else
                            input = $('<span><i>None</i></span>');
                    }

                    td2.append(input);
                    td1.append(label);
                    break;

                case 'boolean':
                    if(col._editable) {
                        input = get_input('add_form_input', 'checkbox', '');
                        if(value === true)
                            input.prop('checked', true);
                    }
                    else {
                        input = $('<span></span>');
                        if(value === false)
                            input = $('<span class="glyphicon glyphicon-remove"></span>');
                        else if(value === true)
                            input = $('<span class="glyphicon glyphicon-ok"></span>');
                    }
                    td2.append(input);
                    td1.append(label);
                    break;

                case 'date':
                    if(col._editable) {
                        input = get_input('add_form_input', 'text', value);
                        td2.append(input);
                        $(input).datepicker({
                            dateFormat: 'mm/dd/yy'
                        });
                        $(input).datepicker('setDate', value);
                    }
                    else {
                        input = $('<span></span>').append(value);
                        if(value === '' || value === null)
                            input = $('<span><i>None</i></span>');
                    }


                    td1.append(label);
                    break;

                case 'datetime':
                case 'timestamp':
                    var timestampval = '';
                    var timestampstr = '';
                    var timestamp = new Date(value*1000);
                    if(value !== null && value !== "" && !isNaN(timestamp.valueOf())) {
                        timestampstr = dateToString(timestamp);
                        timestampval = timestamp.valueOf()/1000;
                    }

                    if(col._editable) {
                        input_user = get_input('', 'text', '');

                        input = get_input('add_form_input', 'hidden', timestampval);
                        $(input_user).attr('onchange', 'updateTimestampInput(this);');
                        td2.append(input_user);
                        td2.append(input);

                        $(input_user).datetimepicker({
                            showSecond: true,
                            dateFormat: 'mm/dd/yy',
                            timeFormat: 'hh:mm:ss'
                        });

                        if(timestampstr !== '')
                            $(input_user).datetimepicker('setDate', timestampstr);
                    }
                    else {
                        input = $('<span>').text(timestampstr);
                        if(timestampstr === '')
                            input = $('<span><i>None</i></span>');
                        td2.append(input);
                    }
                    td1.append(label);
                    break;

                case 'color':
                    var div = $('<div class="minicolors minicolors-theme-bootstrap"></div>');
                    input = get_input('add_form_input minicolors-input', 'text', value);

                    if(!col._editable)
                        $(input).attr('disabled', '');

                    td2.append(div);
                    div.append(input);
                    $(input).minicolors({
                        control: 'wheel',
                        defaultValue: value,
                        position: 'top',
                        theme: 'none'
                    });

                    td1.append(label);
                    break;

                case 'choice':
                    if(col._editable)
                        input = get_choices_input('add_form_input', value, col.choices);
                    else {
                        input = $('<span></span>').append(value.__unicode__);
                        if(value.__unicode__ === '' || value === '')
                            input = $('<span><i>None</i></span>');
                    }

                    td2.append(input);
                    td1.append(label);
                    break;

                default:
                    if(col._editable)
                        input = get_input('add_form_input', 'text', value);
                    else {
                        input = $("<span></span>").append(value);
                        if(value === '' || value === null)
                            input = $('<span><i>None</i></span>');
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
        var inputCls = type === "checkbox" ? cls : "form-control " + cls;
        var input = $("<input/>").val(value)
                                 .attr({
                                     'class': inputCls,
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
        var inputCls = "form-control " + cls
        var input = $("<select></select>").attr({'class': inputCls});

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
     *    col        - The column definition for this field (from this.column
     *
     * Return: The newly created select field
     */
    function get_pk_input (cls, value, col)
    {
        var input = $("<select></select>").attr({'class': cls});
        //Get all objects that the user can select from

        $.get( '/chucho/'+col.app+'/'+col.model_name+'/'
              ,{'jsonData': JSON.stringify({'get_editable': false})}
              ,function(resp) {

                if (col.blank) {
                    var null_option = $('<option>', {text:'(null)'});
                    null_option.val('null');
                    input.append(null_option);
                }
                $(resp.data).each(function(i, obj) {
                    var option = $("<option>", {text: obj.__unicode__})
                        .val(obj.pk);

                    if(value !== '' && obj.pk == value.pk)
                        option.attr('selected', 'selected');
                    input.append(option);

                });
        });

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
     *    modelName - The model name to fetch the objects from for the select field.
     *
     * Return: The newly created select multiple field
     */
    function get_m2m_input (cls, value, modelName, appName)
    {
        var div = $('<div></div>').attr({'class': cls});
        var ul = $('<ul></ul>').css('list-style', 'none');
        div.append(ul);

        //Get all objects that the user can select from
        $.get( '/chucho/'+appName+'/'+modelName+'/'
              ,{'jsonData': JSON.stringify({'get_editable': false})}
              ,function(resp) {

                $(resp.data).each(function(i, obj) {

                    var li = $('<li></li>');
                    var checkbox = get_input('', 'checkbox', obj.pk);
                    var label = $('<label></label>').text(" "+obj.__unicode__);

                     //Pre-select appropriate objects
                    $(value).each(function(i, val) {
                        if(val !== '' && obj.pk == val.pk)
                            checkbox.prop('checked', true);
                    });

                    ul.append(li);
                    li.append(label);
                    label.prepend(checkbox);
                });
        });

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
        //Collect data for new/updated row from dialog fields
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
            var value = $(input).val();
            if (value === 'null')
                value = null;

            return {'pk': value};
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
            return $(input).prop('checked');
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

            var temp = $(e).find('select[name="column"]');
            if ( !temp )
                return;

            if(temp.length > 1) {
                $.each(temp, function(i, val) {
                    if(i === 0)
                        temp_obj.col = $(val).val();
                    else
                        temp_obj.col += "|" + $(val).val();
                });
            }
            else
                temp_obj.col = $(temp).val();

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
        if ( filter_data.length === 0 && $('#chucho-omni-filter').val() )
            filter_data.push({col: 'chucho-omni', val: $('#chucho-omni-filter').val()});

        return filter_data;
    }

    /** This will remove a filter from the filter table */
    function remove_filter_row(e) {
        $(e).parents('div.grid-filter').remove();
        myGrid.refresh();
    }

    /** Take a Date object and return a string formatted as:
     * mm/dd/yyyy HH:MM:SS
     */
    function dateToString(date)
    {
        var newDate = date.getMonth()+1 + "/" + date.getDate() + "/" + date.getFullYear();
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();

        if(hours < 10)
            hours = '0' + hours;
        if(minutes < 10)
            minutes = '0' + minutes;
        if(seconds < 10)
            seconds = '0' + seconds;

        var newTime = hours + ":" + minutes + ":" + seconds;
        var dStr = newDate + " " + newTime;
        return dStr;
    }

    function updateTimestampInput(e) {
        var d = new Date($(e).val());
        var value = null;
        if(!isNaN(d.valueOf()))
            value = d.valueOf()/1000;
         $(e).nextAll('.add_form_input').val(value);
    }

    function loadModelGrid(app, model) {
        var url = "/chucho/model_editor/"+app+"/"+model+"/";
        $.get(url, {}, function(data) {
            $('#chuchoGridContainer').html(data);
        });
    }

    $.extend(window, {
        'DataGrid': DataGrid,
        'loadModelGrid': loadModelGrid,
        'confirm_dialog': confirm_dialog,
        'remove_filter_row': remove_filter_row,
        'updateTimestampInput': updateTimestampInput
    });
});
})(window,document,navigator,window["$"],window["ko"],window["Spinner"]);
})();
